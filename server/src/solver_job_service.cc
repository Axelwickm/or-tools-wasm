#include "server/src/solver_job_service.h"

#include <chrono>
#include <cstdint>
#include <future>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

#include "job.pb.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;

constexpr const char* kProtobufContentType = "application/x-protobuf";
constexpr const char* kPlainTextContentType = "text/plain; charset=utf-8";
constexpr int kJobAccepted = 202;

bridge::SolverJobState ToBridgeState(JobState state) {
  switch (state) {
    case JobState::kQueued:
      return bridge::SOLVER_JOB_STATE_QUEUED;
    case JobState::kStarting:
      return bridge::SOLVER_JOB_STATE_STARTING;
    case JobState::kRunning:
      return bridge::SOLVER_JOB_STATE_RUNNING;
    case JobState::kCancelling:
      return bridge::SOLVER_JOB_STATE_CANCELLING;
    case JobState::kCancelled:
      return bridge::SOLVER_JOB_STATE_CANCELLED;
    case JobState::kSucceeded:
      return bridge::SOLVER_JOB_STATE_SUCCEEDED;
    case JobState::kFailed:
      return bridge::SOLVER_JOB_STATE_FAILED;
  }
  return bridge::SOLVER_JOB_STATE_UNSPECIFIED;
}

bool IsTerminal(JobState state) {
  return state == JobState::kCancelled || state == JobState::kSucceeded ||
         state == JobState::kFailed;
}

HttpBinaryResponse TextResponse(int status, std::string message) {
  return HttpBinaryResponse{status, std::move(message), kPlainTextContentType, {}};
}

HttpBinaryResponse ProtoResponse(int status, const bridge::SolverBridgeResponse& response) {
  std::string bytes;
  if (!response.SerializeToString(&bytes)) {
    return TextResponse(500, "Failed to serialize SolverBridgeResponse.\n");
  }
  return HttpBinaryResponse{status, std::move(bytes), kProtobufContentType, {}};
}

uint64_t JobIdFromRequest(const HttpBinaryRequest& request) {
  if (request.path_matches.empty()) {
    throw std::invalid_argument("Missing job id.");
  }
  return std::stoull(request.path_matches.front());
}

}  // namespace

struct SolverJobService::JobEntry {
  uint32_t request_id = 0;
  std::string solver;
  JobHandle handle;
  std::shared_ptr<std::string> result_payload = std::make_shared<std::string>();
  std::shared_ptr<std::string> error_message = std::make_shared<std::string>();
};

SolverJobService::SolverJobService(JobScheduler& scheduler) : scheduler_(scheduler) {}

void SolverJobService::Register(std::unique_ptr<SolverExecutor> executor) {
  if (!executor) throw std::invalid_argument("SolverJobService::Register requires an executor.");
  std::lock_guard lock(mutex_);
  executors_[executor->solver()] = std::move(executor);
}

HttpBinaryResponse SolverJobService::Submit(const HttpBinaryRequest& request) {
  bridge::SolverBridgeRequest bridge_request;
  if (!bridge_request.ParseFromString(request.body)) {
    return TextResponse(400, "Failed to parse SolverBridgeRequest.\n");
  }

  SolverExecutor* executor = ExecutorFor(bridge_request.solver());
  if (executor == nullptr) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           "Unsupported solver: " + bridge_request.solver(), 400);
  }

  auto entry = std::make_shared<JobEntry>();
  entry->request_id = bridge_request.request_id();
  entry->solver = bridge_request.solver();
  auto result_payload = entry->result_payload;
  auto error_message = entry->error_message;

  SolverExecutorRequest executor_request{
      bridge_request.request_id(),
      bridge_request.solver(),
      bridge_request.payload(),
  };
  JobSpec spec{bridge_request.solver(),
               static_cast<int>(bridge_request.requested_threads())};

  try {
    entry->handle = scheduler_.Submit(spec, [executor, executor_request = std::move(executor_request),
                                             result_payload, error_message](JobContext& context) {
      SolverExecutorResult result = executor->Execute(executor_request, context);
      if (!result.ok) {
        *error_message = result.error_message;
        return JobResult::Failed(result.error_message);
      }
      *result_payload = std::move(result.payload);
      return JobResult::Succeeded();
    });
  } catch (const std::exception& error) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           error.what(), 503);
  }

  {
    std::lock_guard lock(mutex_);
    jobs_[entry->handle.job_id()] = entry;
  }
  return StatusResponse(entry->request_id, entry->handle.status(), kJobAccepted);
}

HttpBinaryResponse SolverJobService::Status(const HttpBinaryRequest& request) {
  try {
    const auto entry = EntryFor(JobIdFromRequest(request));
    if (!entry) return TextResponse(404, "Job not found.\n");
    const JobStatus status = entry->handle.status();
    return StatusResponse(entry->request_id, status,
                          IsTerminal(status.state) ? 200 : kJobAccepted);
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

HttpBinaryResponse SolverJobService::Result(const HttpBinaryRequest& request) {
  try {
    const uint64_t job_id = JobIdFromRequest(request);
    const auto entry = EntryFor(job_id);
    if (!entry) return TextResponse(404, "Job not found.\n");

    const auto future = entry->handle.result();
    if (future.wait_for(std::chrono::seconds(0)) != std::future_status::ready) {
      return StatusResponse(entry->request_id, entry->handle.status(), kJobAccepted);
    }

    const JobResult result = future.get();
    if (result.state == JobState::kSucceeded) {
      return ResultResponse(entry->request_id, entry->solver, job_id, *entry->result_payload);
    }
    return FailureResponse(entry->request_id, entry->solver, job_id,
                           entry->error_message->empty() ? result.message : *entry->error_message,
                           200);
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

HttpBinaryResponse SolverJobService::Cancel(const HttpBinaryRequest& request) {
  try {
    const uint64_t job_id = JobIdFromRequest(request);
    const auto entry = EntryFor(job_id);
    if (!entry) return TextResponse(404, "Job not found.\n");
    entry->handle.Cancel();
    return StatusResponse(entry->request_id, entry->handle.status(), 200);
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

SolverExecutor* SolverJobService::ExecutorFor(const std::string& solver) const {
  std::lock_guard lock(mutex_);
  const auto it = executors_.find(solver);
  return it == executors_.end() ? nullptr : it->second.get();
}

std::shared_ptr<SolverJobService::JobEntry> SolverJobService::EntryFor(uint64_t job_id) const {
  std::lock_guard lock(mutex_);
  const auto it = jobs_.find(job_id);
  return it == jobs_.end() ? nullptr : it->second;
}

HttpBinaryResponse SolverJobService::StatusResponse(uint32_t request_id,
                                                    const JobStatus& status,
                                                    int http_status) const {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(status.solver);
  response.set_job_id(status.job_id);
  auto* payload = response.mutable_status();
  payload->set_request_id(request_id);
  payload->set_solver(status.solver);
  payload->set_state(ToBridgeState(status.state));
  payload->set_created_at_ms(status.created_at_ms);
  payload->set_started_at_ms(status.started_at_ms);
  payload->set_allocated_threads(static_cast<uint32_t>(status.allocated_threads));
  payload->set_queue_position(static_cast<uint32_t>(status.queue_position));
  return ProtoResponse(http_status, response);
}

HttpBinaryResponse SolverJobService::FailureResponse(uint32_t request_id,
                                                     const std::string& solver,
                                                     uint64_t job_id,
                                                     std::string message,
                                                     int http_status) const {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(solver);
  response.set_job_id(job_id);
  auto* failure = response.mutable_failure();
  failure->set_request_id(request_id);
  failure->set_solver(solver);
  failure->set_kind(bridge::SOLVER_FAILURE_KIND_EXECUTOR_ERROR);
  failure->set_message(std::move(message));
  failure->set_retryable(false);
  return ProtoResponse(http_status, response);
}

HttpBinaryResponse SolverJobService::ResultResponse(uint32_t request_id,
                                                    const std::string& solver,
                                                    uint64_t job_id,
                                                    const std::string& payload) const {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(solver);
  response.set_job_id(job_id);
  response.set_result_payload(payload);
  return ProtoResponse(200, response);
}

}  // namespace ortools_wasm::server
