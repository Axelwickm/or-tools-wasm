#include "server/src/solver_job_service.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <future>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "job.pb.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;

constexpr const char* kProtobufContentType = "application/x-protobuf";
constexpr const char* kPlainTextContentType = "text/plain; charset=utf-8";
constexpr int kJobAccepted = 202;
constexpr auto kEventStreamHeartbeatInterval = std::chrono::seconds(15);
constexpr auto kMaximumCleanupInterval = std::chrono::seconds(30);

bridge::SolverJobState ToBridgeState(JobState state) {
  switch (state) {
    case JobState::kQueued: return bridge::SOLVER_JOB_STATE_QUEUED;
    case JobState::kStarting: return bridge::SOLVER_JOB_STATE_STARTING;
    case JobState::kRunning: return bridge::SOLVER_JOB_STATE_RUNNING;
    case JobState::kCancelling: return bridge::SOLVER_JOB_STATE_CANCELLING;
    case JobState::kCancelled: return bridge::SOLVER_JOB_STATE_CANCELLED;
    case JobState::kSucceeded: return bridge::SOLVER_JOB_STATE_SUCCEEDED;
    case JobState::kFailed: return bridge::SOLVER_JOB_STATE_FAILED;
  }
  return bridge::SOLVER_JOB_STATE_UNSPECIFIED;
}

bool IsTerminal(JobState state) {
  return state == JobState::kCancelled || state == JobState::kSucceeded ||
         state == JobState::kFailed;
}

bridge::SolverFailureKind ToBridgeFailureKind(SolverExecutionFailureKind kind) {
  switch (kind) {
    case SolverExecutionFailureKind::kExecutor:
      return bridge::SOLVER_FAILURE_KIND_EXECUTOR_ERROR;
    case SolverExecutionFailureKind::kInvalidRequest:
      return bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST;
    case SolverExecutionFailureKind::kCancelled:
      return bridge::SOLVER_FAILURE_KIND_CANCELLED;
    case SolverExecutionFailureKind::kInternal:
      return bridge::SOLVER_FAILURE_KIND_INTERNAL;
  }
  return bridge::SOLVER_FAILURE_KIND_INTERNAL;
}

HttpBinaryResponse TextResponse(int status, std::string message) {
  return HttpBinaryResponse{status, std::move(message), kPlainTextContentType, {}};
}

template <typename Message>
HttpBinaryResponse ProtoResponse(int status, const Message& response) {
  std::string bytes;
  if (!response.SerializeToString(&bytes)) {
    return TextResponse(500, "Failed to serialize protobuf response.\n");
  }
  return HttpBinaryResponse{status, std::move(bytes), kProtobufContentType, {}};
}

uint64_t JobIdFromRequest(const HttpBinaryRequest& request) {
  if (request.path_matches.empty()) throw std::invalid_argument("Missing job id.");
  return std::stoull(request.path_matches.front());
}

uint64_t EventCursorFromRequest(const HttpBinaryRequest& request) {
  const auto it = request.query_parameters.find("after");
  return it == request.query_parameters.end() ? 0 : std::stoull(it->second);
}

bridge::SolverBridgeResponse StatusBridgeResponse(uint32_t request_id,
                                                  const JobStatus& status) {
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
  return response;
}

bridge::SolverBridgeResponse EventBridgeResponse(uint32_t request_id,
                                                 const std::string& solver,
                                                 uint64_t job_id,
                                                 std::string payload) {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(solver);
  response.set_job_id(job_id);
  response.set_event_payload(std::move(payload));
  return response;
}

bridge::SolverBridgeResponse TerminalBridgeResponse(
    uint32_t request_id, const JobStatus& status,
    const SolverExecutorResult& execution) {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(status.solver);
  response.set_job_id(status.job_id);
  if (status.state == JobState::kSucceeded) {
    response.set_result_payload(execution.payload);
    return response;
  }

  auto* failure = response.mutable_failure();
  failure->set_request_id(request_id);
  failure->set_solver(status.solver);
  if (status.state == JobState::kCancelled) {
    failure->set_kind(bridge::SOLVER_FAILURE_KIND_CANCELLED);
    failure->set_message(status.message.empty() ? "Job cancelled." : status.message);
    return response;
  }
  failure->set_kind(ToBridgeFailureKind(execution.failure_kind));
  failure->set_message(execution.error_message.empty() ? status.message
                                                        : execution.error_message);
  failure->set_trace(execution.trace);
  failure->set_retryable(execution.retryable);
  return response;
}

bool IsTerminalResponse(const bridge::SolverBridgeResponse& response) {
  return response.payload_case() == bridge::SolverBridgeResponse::kResultPayload ||
         response.payload_case() == bridge::SolverBridgeResponse::kFailure;
}

class EventLog {
 public:
  bridge::SolverBridgeResponse Append(bridge::SolverBridgeResponse response,
                                      bool close = false) {
    {
      std::lock_guard lock(mutex_);
      response.set_sequence_id(next_sequence_id_++);
      responses_.push_back(response);
      if (close) closed_at_ = std::chrono::steady_clock::now();
    }
    changed_.notify_all();
    return response;
  }

  std::vector<bridge::SolverBridgeResponse> After(uint64_t sequence_id) const {
    std::lock_guard lock(mutex_);
    std::vector<bridge::SolverBridgeResponse> result;
    for (const auto& response : responses_) {
      if (response.sequence_id() > sequence_id) result.push_back(response);
    }
    return result;
  }

  std::optional<bridge::SolverBridgeResponse> Last() const {
    std::lock_guard lock(mutex_);
    if (responses_.empty()) return std::nullopt;
    return responses_.back();
  }

  struct ReadResult {
    std::optional<bridge::SolverBridgeResponse> response;
    bool closed = false;
  };

  ReadResult WaitAfter(uint64_t sequence_id,
                       std::chrono::milliseconds timeout) const {
    std::unique_lock lock(mutex_);
    changed_.wait_for(lock, timeout, [&] {
      return closed_at_.has_value() ||
             (!responses_.empty() &&
              responses_.back().sequence_id() > sequence_id);
    });
    for (const auto& response : responses_) {
      if (response.sequence_id() > sequence_id) {
        return {response, closed_at_.has_value()};
      }
    }
    return {std::nullopt, closed_at_.has_value()};
  }

  std::optional<std::chrono::steady_clock::time_point> ClosedAt() const {
    std::lock_guard lock(mutex_);
    return closed_at_;
  }

 private:
  mutable std::mutex mutex_;
  mutable std::condition_variable changed_;
  uint64_t next_sequence_id_ = 1;
  std::vector<bridge::SolverBridgeResponse> responses_;
  std::optional<std::chrono::steady_clock::time_point> closed_at_;
};

struct JobOutput {
  EventLog events;
  SolverExecutorResult execution;
};

}  // namespace

struct SolverJobService::JobEntry {
  uint32_t request_id = 0;
  std::string solver;
  JobHandle handle;
  std::shared_ptr<JobOutput> output = std::make_shared<JobOutput>();
};

SolverJobService::SolverJobService(
    JobScheduler& scheduler,
    std::chrono::milliseconds completed_job_retention)
    : scheduler_(scheduler),
      completed_job_retention_(completed_job_retention) {
  if (completed_job_retention_ <= std::chrono::milliseconds::zero()) {
    throw std::invalid_argument(
        "SolverJobService completed-job retention must be positive.");
  }
  cleanup_thread_ = std::thread([this] { CleanupExpiredJobs(); });
}

SolverJobService::~SolverJobService() {
  {
    std::lock_guard lock(cleanup_mutex_);
    stop_cleanup_ = true;
  }
  cleanup_cv_.notify_one();
  if (cleanup_thread_.joinable()) cleanup_thread_.join();
}

void SolverJobService::Register(std::unique_ptr<SolverExecutor> executor) {
  if (!executor) throw std::invalid_argument("SolverJobService::Register requires an executor.");
  std::lock_guard lock(mutex_);
  executors_[executor->solver()] = std::move(executor);
}

HttpBinaryResponse SolverJobService::Submit(const HttpBinaryRequest& request) {
  bridge::SolverBridgeRequest bridge_request;
  if (!bridge_request.ParseFromString(request.body)) {
    return FailureResponse(0, {}, 0, "Failed to parse SolverBridgeRequest.", 400,
                           bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST);
  }
  if (bridge_request.operation_case() != bridge::SolverBridgeRequest::kExecutePayload) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           "Job submission requires an execute payload.", 400,
                           bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST);
  }

  SolverExecutor* executor = ExecutorFor(bridge_request.solver());
  if (executor == nullptr) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           "Unsupported solver: " + bridge_request.solver(), 400,
                           bridge::SOLVER_FAILURE_KIND_UNSUPPORTED_SOLVER);
  }

  SolverExecutorRequest executor_request{
      bridge_request.request_id(), bridge_request.solver(),
      bridge_request.execute_payload()};
  const int client_requested = bridge_request.has_settings()
                                   ? static_cast<int>(bridge_request.settings().requested_threads())
                                   : 0;
  int requested_threads = 0;
  try {
    requested_threads = executor->RequestedThreads(
        executor_request, client_requested, scheduler_.Stats().total_threads);
  } catch (const std::exception& error) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           error.what(), 400,
                           bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST);
  }

  auto entry = std::make_shared<JobEntry>();
  entry->request_id = bridge_request.request_id();
  entry->solver = bridge_request.solver();
  auto output = entry->output;

  try {
    entry->handle = scheduler_.Submit(
        JobSpec{bridge_request.solver(), requested_threads},
        [executor, executor_request = std::move(executor_request),
         output](JobContext& context) {
          output->execution = executor->Execute(
              executor_request, context,
              [output, request_id = executor_request.request_id,
               solver = executor_request.solver,
               job_id = context.job_id()](std::string payload) {
                output->events.Append(EventBridgeResponse(
                    request_id, solver, job_id, std::move(payload)));
              });
          if (!output->execution.ok) {
            return JobResult::Failed(output->execution.error_message);
          }
          return JobResult::Succeeded();
        },
        [output, request_id = entry->request_id](const JobStatus& status) {
          output->events.Append(StatusBridgeResponse(request_id, status));
          if (IsTerminal(status.state)) {
            output->events.Append(
                TerminalBridgeResponse(request_id, status, output->execution),
                true);
          }
        });
  } catch (const JobQueueFullError& error) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           error.what(), 503,
                           bridge::SOLVER_FAILURE_KIND_QUEUE_FULL, true);
  } catch (const std::exception& error) {
    return FailureResponse(bridge_request.request_id(), bridge_request.solver(), 0,
                           error.what(), 503,
                           bridge::SOLVER_FAILURE_KIND_INTERNAL, true);
  }

  {
    std::lock_guard lock(mutex_);
    jobs_[entry->handle.job_id()] = entry;
  }
  if (auto response = entry->output->events.Last()) {
    return ProtoResponse(kJobAccepted, *response);
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

HttpBinaryResponse SolverJobService::Events(const HttpBinaryRequest& request) {
  try {
    const auto entry = EntryFor(JobIdFromRequest(request));
    if (!entry) return TextResponse(404, "Job not found.\n");
    bridge::SolverEventBatch batch;
    for (const auto& response :
         entry->output->events.After(EventCursorFromRequest(request))) {
      *batch.add_responses() = response;
    }
    return ProtoResponse(200, batch);
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

HttpEventStreamResponse SolverJobService::StreamEvents(
    const HttpBinaryRequest& request) {
  try {
    const auto entry = EntryFor(JobIdFromRequest(request));
    if (!entry) return HttpEventStreamResponse{404, "Job not found.\n", {}, {}};
    if (entry->handle.status().state == JobState::kQueued) {
      return HttpEventStreamResponse{
          409, "Job is queued; poll until scheduler capacity is allocated.\n",
          {}, {}};
    }
    const uint64_t initial_sequence_id = EventCursorFromRequest(request);
    return HttpEventStreamResponse{
        200,
        {},
        {},
        [entry, sequence_id = initial_sequence_id]() mutable
            -> std::optional<HttpServerSentEvent> {
          const EventLog::ReadResult read = entry->output->events.WaitAfter(
              sequence_id, kEventStreamHeartbeatInterval);
          if (!read.response.has_value()) {
            if (read.closed) return std::nullopt;
            return HttpServerSentEvent{};
          }
          sequence_id = read.response->sequence_id();
          std::string bytes;
          if (!read.response->SerializeToString(&bytes)) {
            throw std::runtime_error("Failed to serialize streamed protobuf response.");
          }
          return HttpServerSentEvent{
              std::to_string(sequence_id), "solver", std::move(bytes),
              IsTerminalResponse(*read.response)};
        }};
  } catch (const std::exception& error) {
    return HttpEventStreamResponse{400, std::string(error.what()) + "\n", {}, {}};
  }
}

HttpBinaryResponse SolverJobService::Result(const HttpBinaryRequest& request) {
  try {
    const uint64_t job_id = JobIdFromRequest(request);
    const auto entry = EntryFor(job_id);
    if (!entry) return TextResponse(404, "Job not found.\n");
    const auto future = entry->handle.result();
    if (future.wait_for(std::chrono::seconds(0)) != std::future_status::ready) {
      return HttpBinaryResponse{204, {}, kProtobufContentType, {}};
    }

    const JobResult result = future.get();
    if (result.state == JobState::kSucceeded) {
      return ResultResponse(entry->request_id, entry->solver, job_id,
                            entry->output->execution.payload);
    }
    if (result.state == JobState::kCancelled) {
      return FailureResponse(entry->request_id, entry->solver, job_id,
                             result.message, 200,
                             bridge::SOLVER_FAILURE_KIND_CANCELLED);
    }
    return FailureResponse(
        entry->request_id, entry->solver, job_id,
        entry->output->execution.error_message.empty()
            ? result.message
            : entry->output->execution.error_message,
        200, ToBridgeFailureKind(entry->output->execution.failure_kind),
        entry->output->execution.retryable, entry->output->execution.trace);
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

HttpBinaryResponse SolverJobService::Cancel(const HttpBinaryRequest& request) {
  try {
    const uint64_t job_id = JobIdFromRequest(request);
    const auto entry = EntryFor(job_id);
    if (!entry) return TextResponse(404, "Job not found.\n");

    bridge::SolverBridgeRequest bridge_request;
    if (!bridge_request.ParseFromString(request.body) ||
        bridge_request.operation_case() != bridge::SolverBridgeRequest::kCancel) {
      return FailureResponse(0, entry->solver, job_id,
                             "Cancellation requires a SolverCancelRequest.", 400,
                             bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST);
    }
    if (bridge_request.solver() != entry->solver ||
        bridge_request.cancel().target_request_id() != entry->request_id) {
      return FailureResponse(bridge_request.request_id(), entry->solver, job_id,
                             "Cancellation target does not match the job.", 400,
                             bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST);
    }
    entry->handle.Cancel();

    bridge::SolverBridgeResponse response;
    response.set_request_id(bridge_request.request_id());
    response.set_solver(entry->solver);
    response.set_job_id(job_id);
    response.mutable_cancelled()->set_target_request_id(entry->request_id);
    return ProtoResponse(200, response);
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

HttpBinaryResponse SolverJobService::Release(const HttpBinaryRequest& request) {
  try {
    const uint64_t job_id = JobIdFromRequest(request);
    const auto entry = EntryFor(job_id);
    if (!entry) return TextResponse(404, "Job not found.\n");
    if (!IsTerminal(entry->handle.status().state)) {
      return TextResponse(409, "Job is not complete.\n");
    }

    std::lock_guard lock(mutex_);
    const auto it = jobs_.find(job_id);
    if (it != jobs_.end() && it->second == entry) jobs_.erase(it);
    return HttpBinaryResponse{204, {}, kProtobufContentType, {}};
  } catch (const std::exception& error) {
    return TextResponse(400, std::string(error.what()) + "\n");
  }
}

SolverExecutor* SolverJobService::ExecutorFor(const std::string& solver) const {
  std::lock_guard lock(mutex_);
  const auto it = executors_.find(solver);
  return it == executors_.end() ? nullptr : it->second.get();
}

std::shared_ptr<SolverJobService::JobEntry> SolverJobService::EntryFor(
    uint64_t job_id) const {
  std::lock_guard lock(mutex_);
  const auto it = jobs_.find(job_id);
  return it == jobs_.end() ? nullptr : it->second;
}

void SolverJobService::CleanupExpiredJobs() {
  const auto cleanup_interval =
      std::min(completed_job_retention_,
               std::chrono::duration_cast<std::chrono::milliseconds>(
                   kMaximumCleanupInterval));
  std::unique_lock cleanup_lock(cleanup_mutex_);
  while (!cleanup_cv_.wait_for(
      cleanup_lock, cleanup_interval,
      [this] { return stop_cleanup_; })) {
    cleanup_lock.unlock();

    const auto now = std::chrono::steady_clock::now();
    {
      std::lock_guard jobs_lock(mutex_);
      for (auto it = jobs_.begin(); it != jobs_.end();) {
        const auto closed_at = it->second->output->events.ClosedAt();
        if (closed_at.has_value() &&
            *closed_at + completed_job_retention_ <= now) {
          it = jobs_.erase(it);
          continue;
        }
        ++it;
      }
    }
    cleanup_lock.lock();
  }
}

HttpBinaryResponse SolverJobService::StatusResponse(uint32_t request_id,
                                                    const JobStatus& status,
                                                    int http_status) const {
  return ProtoResponse(http_status, StatusBridgeResponse(request_id, status));
}

HttpBinaryResponse SolverJobService::FailureResponse(
    uint32_t request_id, const std::string& solver, uint64_t job_id,
    std::string message, int http_status, bridge::SolverFailureKind kind,
    bool retryable, std::string trace) const {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(solver);
  response.set_job_id(job_id);
  auto* failure = response.mutable_failure();
  failure->set_request_id(request_id);
  failure->set_solver(solver);
  failure->set_kind(kind);
  failure->set_message(std::move(message));
  failure->set_trace(std::move(trace));
  failure->set_retryable(retryable);
  return ProtoResponse(http_status, response);
}

HttpBinaryResponse SolverJobService::ResultResponse(
    uint32_t request_id, const std::string& solver, uint64_t job_id,
    const std::string& payload) const {
  bridge::SolverBridgeResponse response;
  response.set_request_id(request_id);
  response.set_solver(solver);
  response.set_job_id(job_id);
  response.set_result_payload(payload);
  return ProtoResponse(200, response);
}

}  // namespace ortools_wasm::server
