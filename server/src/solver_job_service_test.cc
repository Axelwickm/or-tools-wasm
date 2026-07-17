#include "server/src/solver_job_service.h"

#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "job.pb.h"

namespace ortools_wasm::server {
namespace {

using namespace std::chrono_literals;
namespace bridge = ::ortools_wasm::bridge::v1;

class ManualEvent {
 public:
  void Set() {
    {
      std::lock_guard lock(mutex_);
      set_ = true;
    }
    cv_.notify_all();
  }

  void Wait() {
    std::unique_lock lock(mutex_);
    cv_.wait(lock, [this] { return set_; });
  }

  bool WaitFor(std::chrono::milliseconds timeout) {
    std::unique_lock lock(mutex_);
    return cv_.wait_for(lock, timeout, [this] { return set_; });
  }

 private:
  std::mutex mutex_;
  std::condition_variable cv_;
  bool set_ = false;
};

class TestFailure : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

void Expect(bool condition, const std::string& message) {
  if (!condition) throw TestFailure(message);
}

template <typename Lhs, typename Rhs>
void ExpectEq(const Lhs& lhs, const Rhs& rhs, const std::string& message) {
  if (!(lhs == rhs)) throw TestFailure(message);
}

class FakeExecutor final : public SolverExecutor {
 public:
  using ExecuteFn = std::function<SolverExecutorResult(
      const SolverExecutorRequest&, const JobContext&, const SolverEventSink&)>;

  explicit FakeExecutor(ExecuteFn execute) : execute_(std::move(execute)) {}

  std::string solver() const override { return "fake"; }
  int RequestedThreads(const SolverExecutorRequest&, int client_requested_threads,
                       int) const override {
    return client_requested_threads > 0 ? client_requested_threads : 1;
  }
  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context,
                               const SolverEventSink& emit_event) override {
    return execute_(request, context, emit_event);
  }

 private:
  ExecuteFn execute_;
};

HttpBinaryRequest SubmitRequest(uint32_t request_id = 7) {
  bridge::SolverBridgeRequest request;
  request.set_request_id(request_id);
  request.set_solver("fake");
  request.set_execute_payload("fake-request");
  request.mutable_settings()->set_requested_threads(1);

  HttpBinaryRequest http_request;
  if (!request.SerializeToString(&http_request.body)) {
    throw TestFailure("failed to serialize submit request");
  }
  return http_request;
}

HttpBinaryRequest JobRequest(uint64_t job_id) {
  HttpBinaryRequest request;
  request.path_matches.push_back(std::to_string(job_id));
  return request;
}

HttpBinaryRequest EventsRequest(uint64_t job_id, uint64_t after = 0) {
  HttpBinaryRequest request = JobRequest(job_id);
  request.query_parameters["after"] = std::to_string(after);
  return request;
}

HttpBinaryRequest CancelRequest(uint64_t job_id, uint32_t target_request_id = 7) {
  bridge::SolverBridgeRequest request;
  request.set_request_id(8);
  request.set_solver("fake");
  request.mutable_cancel()->set_target_request_id(target_request_id);
  HttpBinaryRequest http_request = JobRequest(job_id);
  if (!request.SerializeToString(&http_request.body)) {
    throw TestFailure("failed to serialize cancel request");
  }
  return http_request;
}

bridge::SolverBridgeResponse DecodeResponse(const HttpBinaryResponse& response) {
  bridge::SolverBridgeResponse decoded;
  if (!decoded.ParseFromString(response.body)) {
    throw TestFailure("failed to parse SolverBridgeResponse");
  }
  return decoded;
}

bridge::SolverEventBatch DecodeBatch(const HttpBinaryResponse& response) {
  bridge::SolverEventBatch decoded;
  if (!decoded.ParseFromString(response.body)) {
    throw TestFailure("failed to parse SolverEventBatch");
  }
  return decoded;
}

bridge::SolverBridgeResponse SubmitJob(SolverJobService* service) {
  const HttpBinaryResponse response = service->Submit(SubmitRequest());
  ExpectEq(response.status, 202, "submit returns accepted");
  bridge::SolverBridgeResponse decoded = DecodeResponse(response);
  Expect(decoded.job_id() > 0, "submit response includes job id");
  ExpectEq(decoded.payload_case(), bridge::SolverBridgeResponse::kStatus,
           "submit response carries status");
  Expect(decoded.sequence_id() > 0, "submit response is sequenced");
  return decoded;
}

bridge::SolverBridgeResponse WaitForResult(SolverJobService* service,
                                           uint64_t job_id) {
  const auto deadline = std::chrono::steady_clock::now() + 2s;
  while (std::chrono::steady_clock::now() < deadline) {
    const HttpBinaryResponse response = service->Result(JobRequest(job_id));
    if (response.status == 204) {
      std::this_thread::sleep_for(10ms);
      continue;
    }
    return DecodeResponse(response);
  }
  throw TestFailure("timed out waiting for result payload");
}

bool ContainsState(const bridge::SolverEventBatch& batch,
                   bridge::SolverJobState state) {
  for (const auto& response : batch.responses()) {
    if (response.payload_case() == bridge::SolverBridgeResponse::kStatus &&
        response.status().state() == state) return true;
  }
  return false;
}

void StatusIsSnapshotAndDoesNotConsumeEvents() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler);
  ManualEvent started;
  ManualEvent release;
  service.Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest&, const JobContext&,
          const SolverEventSink& emit_event) {
        started.Set();
        emit_event("event-one");
        release.Wait();
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  Expect(started.WaitFor(2s), "fake executor starts");
  const auto status = DecodeResponse(service.Status(JobRequest(submitted.job_id())));
  ExpectEq(status.payload_case(), bridge::SolverBridgeResponse::kStatus,
           "status endpoint remains a status snapshot");

  const auto first = DecodeBatch(service.Events(EventsRequest(submitted.job_id())));
  const auto second = DecodeBatch(service.Events(EventsRequest(submitted.job_id())));
  ExpectEq(first.SerializeAsString(), second.SerializeAsString(),
           "reading status or events does not consume the event log");
  release.Set();
  WaitForResult(&service, submitted.job_id());
}

void EventsAreOrderedAndCursorBased() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler);
  ManualEvent emitted;
  ManualEvent release;
  service.Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest&, const JobContext&,
          const SolverEventSink& emit_event) {
        emit_event("event-one");
        emit_event("event-two");
        emitted.Set();
        release.Wait();
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  Expect(emitted.WaitFor(2s), "fake executor emits events");
  const auto batch = DecodeBatch(service.Events(EventsRequest(submitted.job_id())));
  Expect(batch.responses_size() >= 4, "event log contains lifecycle and solver events");
  uint64_t previous = 0;
  for (const auto& response : batch.responses()) {
    Expect(response.sequence_id() > previous, "event sequence is strictly increasing");
    previous = response.sequence_id();
  }
  const auto after = DecodeBatch(service.Events(EventsRequest(submitted.job_id(), previous)));
  ExpectEq(after.responses_size(), 0, "cursor excludes previously observed events");
  release.Set();
  WaitForResult(&service, submitted.job_id());
}

void ResultIsIndependentFromEvents() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink& emit_event) {
        emit_event("event-one");
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  const auto result = WaitForResult(&service, submitted.job_id());
  ExpectEq(result.payload_case(), bridge::SolverBridgeResponse::kResultPayload,
           "result endpoint returns only the terminal result");
  ExpectEq(result.result_payload(), std::string("result-one"),
           "result payload is preserved");
  const auto events = DecodeBatch(service.Events(EventsRequest(submitted.job_id())));
  Expect(ContainsState(events, bridge::SOLVER_JOB_STATE_RUNNING),
         "fast job retains running status in event log");
  Expect(ContainsState(events, bridge::SOLVER_JOB_STATE_SUCCEEDED),
         "fast job retains succeeded status in event log");
}

void CancellationUsesGenericProtocolAndInterruptsExecutor() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler);
  ManualEvent handler_registered;
  ManualEvent interrupted;
  service.Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest&, const JobContext& context,
          const SolverEventSink&) {
        auto registration = context.OnCancellation([&] { interrupted.Set(); });
        handler_registered.Set();
        interrupted.Wait();
        return SolverExecutorResult{true, "ignored-after-cancel", {}};
      }));

  const auto submitted = SubmitJob(&service);
  Expect(handler_registered.WaitFor(2s), "executor registers cancellation handler");
  const auto acknowledgement =
      DecodeResponse(service.Cancel(CancelRequest(submitted.job_id())));
  ExpectEq(acknowledgement.payload_case(),
           bridge::SolverBridgeResponse::kCancelled,
           "cancel endpoint returns generic cancellation acknowledgement");
  ExpectEq(acknowledgement.cancelled().target_request_id(), 7u,
           "acknowledgement identifies the cancelled request");
  Expect(interrupted.WaitFor(2s), "cancel command interrupts executor");

  const auto result = WaitForResult(&service, submitted.job_id());
  ExpectEq(result.payload_case(), bridge::SolverBridgeResponse::kFailure,
           "cancelled job has execution failure result");
  ExpectEq(result.failure().kind(), bridge::SOLVER_FAILURE_KIND_CANCELLED,
           "cancelled job remains distinct from solver result semantics");
}

using TestFn = void (*)();

int RunAllTests() {
  const std::vector<std::pair<std::string, TestFn>> tests = {
      {"StatusIsSnapshotAndDoesNotConsumeEvents", StatusIsSnapshotAndDoesNotConsumeEvents},
      {"EventsAreOrderedAndCursorBased", EventsAreOrderedAndCursorBased},
      {"ResultIsIndependentFromEvents", ResultIsIndependentFromEvents},
      {"CancellationUsesGenericProtocolAndInterruptsExecutor",
       CancellationUsesGenericProtocolAndInterruptsExecutor},
  };
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "[PASS] " << name << '\n';
    } catch (const std::exception& error) {
      std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
      return EXIT_FAILURE;
    }
  }
  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() { return ortools_wasm::server::RunAllTests(); }
