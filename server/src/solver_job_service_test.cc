#include "server/src/solver_job_service.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <limits>
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

constexpr auto kTestCompletedJobRetention = 1h;

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
  request.mutable_resources()->set_threads(1);

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
  ExpectEq(decoded.sequence_id(), 1u,
           "submit response starts the event-delivery cursor");
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
  SolverJobService service(scheduler, kTestCompletedJobRetention);
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
  SolverJobService service(scheduler, kTestCompletedJobRetention);
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
  const auto tail = DecodeBatch(service.Events(EventsRequest(submitted.job_id(), previous - 1)));
  ExpectEq(tail.responses_size(), 1, "Cursor reads exactly the next entry");
  ExpectEq(tail.responses(0).sequence_id(), previous, "Cursor addresses the expected entry");
  const auto future = DecodeBatch(service.Events(EventsRequest(submitted.job_id(), std::numeric_limits<uint64_t>::max())));
  ExpectEq(future.responses_size(), 0, "Future cursors do not overflow iterator offsets");
  release.Set();
  WaitForResult(&service, submitted.job_id());
}

void ResultIsIndependentFromEvents() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
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

void FastJobCallbacksRemainAfterSubmissionCursor() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink& emit_event) {
        emit_event("event-one");
        emit_event("event-two");
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  WaitForResult(&service, submitted.job_id());
  const auto events = DecodeBatch(service.Events(
      EventsRequest(submitted.job_id(), submitted.sequence_id())));
  std::vector<std::string> callback_payloads;
  for (const auto& response : events.responses()) {
    if (response.payload_case() ==
        bridge::SolverBridgeResponse::kEventPayload) {
      callback_payloads.push_back(response.event_payload());
    }
  }
  ExpectEq(callback_payloads,
           std::vector<std::string>({"event-one", "event-two"}),
           "submission cursor does not skip fast solver callbacks");
}

void EventStreamEndsWithSequencedResultAndResumes() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink& emit_event) {
        emit_event("event-one");
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  HttpEventStreamResponse stream =
      service.StreamEvents(EventsRequest(submitted.job_id(), submitted.sequence_id()));
  ExpectEq(stream.status, 200, "event stream opens");
  Expect(static_cast<bool>(stream.next), "event stream has a source");

  uint64_t previous = submitted.sequence_id();
  bool received_result = false;
  for (int attempt = 0; attempt < 10 && !received_result; ++attempt) {
    const auto event = stream.next();
    Expect(event.has_value(), "event stream remains open before terminal result");
    if (event->event.empty()) continue;
    bridge::SolverBridgeResponse response;
    Expect(response.ParseFromString(event->data), "stream event contains protobuf response");
    Expect(response.sequence_id() > previous, "stream sequence is strictly increasing");
    previous = response.sequence_id();
    received_result = response.payload_case() ==
                      bridge::SolverBridgeResponse::kResultPayload;
    if (received_result) {
      ExpectEq(response.result_payload(), std::string("result-one"),
               "stream preserves terminal result");
      Expect(event->close, "terminal result closes stream");
    }
  }
  Expect(received_result, "event stream emits terminal result");

  HttpEventStreamResponse resumed =
      service.StreamEvents(EventsRequest(submitted.job_id(), previous));
  Expect(!resumed.next().has_value(),
         "resuming after terminal sequence closes immediately");
}

void QueuedJobsUsePollingInsteadOfHoldingEventStreams() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  ManualEvent first_started;
  ManualEvent release_first;
  service.Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest& request, const JobContext&,
          const SolverEventSink&) {
        if (request.request_id == 7) {
          first_started.Set();
          release_first.Wait();
        }
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto running = SubmitJob(&service);
  Expect(first_started.WaitFor(2s), "first fake job starts");
  const auto queued = DecodeResponse(service.Submit(SubmitRequest(9)));
  ExpectEq(queued.payload_case(), bridge::SolverBridgeResponse::kStatus,
           "queued submission returns status");
  ExpectEq(queued.status().state(), bridge::SOLVER_JOB_STATE_QUEUED,
           "second fake job is queued");

  const HttpEventStreamResponse stream =
      service.StreamEvents(EventsRequest(queued.job_id(), queued.sequence_id()));
  ExpectEq(stream.status, 409,
           "queued job does not consume an HTTP event-stream worker");
  Expect(!stream.next, "queued job stream has no blocking event source");

  release_first.Set();
  WaitForResult(&service, running.job_id());
  WaitForResult(&service, queued.job_id());
}

void ExecutorFailureMetadataIsPreserved() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink&) {
        return SolverExecutorResult{
            false, {}, "invalid fake request",
            SolverExecutionFailureKind::kInvalidRequest, "fake trace", true};
      }));

  const auto submitted = SubmitJob(&service);
  const auto result = WaitForResult(&service, submitted.job_id());
  ExpectEq(result.payload_case(), bridge::SolverBridgeResponse::kFailure,
           "executor failure returns failure payload");
  ExpectEq(result.failure().message(), std::string("invalid fake request"),
           "executor failure message is preserved");
  ExpectEq(result.failure().kind(), bridge::SOLVER_FAILURE_KIND_INVALID_REQUEST,
           "executor failure kind is preserved");
  ExpectEq(result.failure().trace(), std::string("fake trace"),
           "executor failure trace is preserved");
  Expect(result.failure().retryable(), "executor retryability is preserved");
}

void CancellationUsesGenericProtocolAndInterruptsExecutor() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
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

void CompletedJobsCanBeReleased() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink&) {
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  WaitForResult(&service, submitted.job_id());
  ExpectEq(service.Release(JobRequest(submitted.job_id())).status, 204,
           "completed job release succeeds");
  ExpectEq(service.Status(JobRequest(submitted.job_id())).status, 404,
           "released job state is discarded");
}

void RunningJobsCannotBeReleased() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  ManualEvent started;
  ManualEvent release;
  service.Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest&, const JobContext&,
          const SolverEventSink&) {
        started.Set();
        release.Wait();
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  Expect(started.WaitFor(2s), "fake executor starts");
  ExpectEq(service.Release(JobRequest(submitted.job_id())).status, 409,
           "running job release is rejected");
  release.Set();
  WaitForResult(&service, submitted.job_id());
}

void CompletedJobsExpireWithoutExplicitRelease() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, 50ms);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink&) {
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  WaitForResult(&service, submitted.job_id());

  const auto deadline = std::chrono::steady_clock::now() + 2s;
  while (std::chrono::steady_clock::now() < deadline &&
         service.Status(JobRequest(submitted.job_id())).status != 404) {
    std::this_thread::sleep_for(10ms);
  }
  ExpectEq(service.Status(JobRequest(submitted.job_id())).status, 404,
           "completed job expires without release");
  ExpectEq(service.Events(EventsRequest(submitted.job_id())).status, 404,
           "expired job event history is discarded");
}

void RunningJobsDoNotExpire() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, 20ms);
  ManualEvent started;
  ManualEvent release;
  service.Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest&, const JobContext&,
          const SolverEventSink&) {
        started.Set();
        release.Wait();
        return SolverExecutorResult{true, "result-one", {}};
      }));

  const auto submitted = SubmitJob(&service);
  Expect(started.WaitFor(2s), "fake executor starts");
  std::this_thread::sleep_for(60ms);
  ExpectEq(service.Status(JobRequest(submitted.job_id())).status, 202,
           "running job remains retained");
  release.Set();
  WaitForResult(&service, submitted.job_id());
}

void DestructionDrainsSchedulerBeforeDestroyingExecutors() {
  JobScheduler scheduler({1, 8});
  auto service =
      std::make_unique<SolverJobService>(scheduler, kTestCompletedJobRetention);
  ManualEvent started;
  ManualEvent release;
  std::atomic<int> executions = 0;
  service->Register(std::make_unique<FakeExecutor>(
      [&](const SolverExecutorRequest&, const JobContext&,
          const SolverEventSink&) {
        ++executions;
        started.Set();
        release.Wait();
        return SolverExecutorResult{true, "result-one", {}};
      }));

  SubmitJob(service.get());
  Expect(started.WaitFor(2s), "fake executor starts");
  const auto queued = service->Submit(SubmitRequest(9));
  ExpectEq(queued.status, 202, "second job is accepted while executor is active");

  auto destruction = std::async(std::launch::async, [&] { service.reset(); });
  const auto destruction_before_release = destruction.wait_for(50ms);

  const auto shutdown_deadline = std::chrono::steady_clock::now() + 2s;
  while (std::chrono::steady_clock::now() < shutdown_deadline &&
         scheduler.Stats().queued_jobs != 0) {
    std::this_thread::sleep_for(10ms);
  }
  const int queued_jobs_during_shutdown = scheduler.Stats().queued_jobs;

  release.Set();
  ExpectEq(destruction.wait_for(2s), std::future_status::ready,
           "service destruction finishes after active work exits");
  destruction.get();
  ExpectEq(destruction_before_release, std::future_status::timeout,
           "service destruction waits for active executor work");
  ExpectEq(queued_jobs_during_shutdown, 0,
           "service destruction cancels queued work");
  ExpectEq(executions.load(), 1,
           "queued work does not run while the service is being destroyed");
}

void DuplicateRegistrationPreservesExecutor() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest&, const JobContext&,
         const SolverEventSink&) {
        return SolverExecutorResult{true, "original", {}};
      }));
  bool rejected = false;
  try {
    service.Register(std::make_unique<FakeExecutor>(
        [](const SolverExecutorRequest&, const JobContext&,
           const SolverEventSink&) {
          return SolverExecutorResult{true, "replacement", {}};
        }));
  } catch (const std::invalid_argument& error) {
    rejected = true;
    ExpectEq(std::string(error.what()),
             std::string("Solver executor already registered: fake"),
             "duplicate error identifies the solver");
  }
  Expect(rejected, "duplicate registration is rejected");
  const auto submitted = SubmitJob(&service);
  const auto result = WaitForResult(&service, submitted.job_id());
  ExpectEq(result.result_payload(), std::string("original"),
           "rejected registration preserves the original executor");
}

bridge::SolverBridgeResponse WaitForCallback(SolverJobService* service, uint64_t job_id) {
  const auto deadline = std::chrono::steady_clock::now() + 2s;
  while (std::chrono::steady_clock::now() < deadline) {
    bridge::SolverEventBatch batch;
    batch.ParseFromString(service->Events(EventsRequest(job_id)).body);
    for (const auto& response : batch.responses()) if (response.has_callback_request()) return response;
    std::this_thread::sleep_for(1ms);
  }
  throw TestFailure("Callback event did not arrive");
}

void CallbackRepliesAreCorrelatedAndCancellationWakesWaiters() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  std::atomic<int> interrupted = 0;
  service.Register(std::make_unique<FakeExecutor>([&](const SolverExecutorRequest& request, const JobContext& context, const SolverEventSink&) {
    auto cancellation = context.OnCancellation([&] { ++interrupted; });
    const auto reply = request.callback("native-data");
    return SolverExecutorResult{true, reply.value_or("stopped"), {}};
  }));
  const auto submitted = SubmitJob(&service);
  const auto callback = WaitForCallback(&service, submitted.job_id());
  Expect(callback.callback_request().payload() == "native-data", "Callback data delivered through event log");
  bridge::SolverBridgeRequest input;
  input.set_request_id(7); input.set_solver("fake");
  input.mutable_callback_reply()->set_callback_id(callback.callback_request().callback_id() + 1);
  input.mutable_callback_reply()->set_payload("native-reply");
  auto reply_request = JobRequest(submitted.job_id()); reply_request.body = input.SerializeAsString();
  ExpectEq(service.Callback(reply_request).status, 409, "Unknown callback ID rejects");
  input.mutable_callback_reply()->set_callback_id(callback.callback_request().callback_id());
  input.set_request_id(99); reply_request.body = input.SerializeAsString();
  ExpectEq(service.Callback(reply_request).status, 400, "Reply from a different request rejects");
  input.set_request_id(7); reply_request.body = input.SerializeAsString();
  ExpectEq(service.Callback(reply_request).status, 200, "Matching callback reply accepted");
  ExpectEq(service.Callback(reply_request).status, 409, "Duplicate callback reply rejects");
  Expect(WaitForResult(&service, submitted.job_id()).result_payload() == "native-reply", "Native execution receives callback reply");
  const auto cancelled = SubmitJob(&service);
  WaitForCallback(&service, cancelled.job_id());
  ExpectEq(service.Cancel(CancelRequest(cancelled.job_id())).status, 200, "Waiting callback job can be cancelled");
  Expect(WaitForResult(&service, cancelled.job_id()).has_failure() && interrupted == 1,
    "Cancellation wakes callback wait and native interruption registration");
  const auto cancelled_history = DecodeBatch(service.Events(EventsRequest(cancelled.job_id())));
  for (const auto& response : cancelled_history.responses()) {
    Expect(!response.has_callback_request(), "Cancelled callback payload is released");
  }
}

void AcknowledgedCallbackPayloadsAreReleasedWhileJobRuns() {
  JobScheduler scheduler({1, 8});
  SolverJobService service(scheduler, kTestCompletedJobRetention);
  service.Register(std::make_unique<FakeExecutor>(
      [](const SolverExecutorRequest& request, const JobContext&, const SolverEventSink& emit_event) {
        emit_event("ordinary-event");
        for (int index = 0; index < 16; ++index) {
          if (!request.callback(std::string(1024 * 1024, 'x'))) break;
        }
        return SolverExecutorResult{true, "finished", {}};
      }));
  const auto submitted = SubmitJob(&service);
  uint64_t previous = submitted.sequence_id();
  for (int index = 0; index < 16; ++index) {
    const auto callback = WaitForCallback(&service, submitted.job_id());
    Expect(callback.sequence_id() > previous, "Each new callback advances the cursor");
    ExpectEq(callback.callback_request().payload().size(), size_t{1024 * 1024}, "Pending callback data is preserved");
    bridge::SolverBridgeRequest input;
    input.set_request_id(7);
    input.set_solver("fake");
    input.mutable_callback_reply()->set_callback_id(callback.callback_request().callback_id());
    input.mutable_callback_reply()->set_payload("reply");
    auto reply_request = JobRequest(submitted.job_id());
    reply_request.body = input.SerializeAsString();
    ExpectEq(service.Callback(reply_request).status, 200, "Callback reply acknowledged");

    const auto history = DecodeBatch(service.Events(EventsRequest(submitted.job_id())));
    Expect(history.ByteSizeLong() < 1024 * 1024 + 4096, "History retains at most the next pending solution vector");
    bool metadata = false;
    bool ordinary_event = false;
    for (const auto& response : history.responses()) {
      if (response.sequence_id() == callback.sequence_id()) {
        metadata = response.request_id() == 7 && response.solver() == "fake" &&
                   response.job_id() == submitted.job_id() &&
                   response.payload_case() == bridge::SolverBridgeResponse::PAYLOAD_NOT_SET;
      }
      if (response.sequence_id() <= callback.sequence_id()) {
        Expect(!response.has_callback_request(), "Acknowledged callbacks cannot replay");
      }
      ordinary_event |= response.event_payload() == "ordinary-event";
    }
    Expect(metadata, "Acknowledged callback keeps sequence and correlation metadata");
    Expect(ordinary_event, "Ordinary event history is unchanged");
    previous = callback.sequence_id();
  }
  ExpectEq(WaitForResult(&service, submitted.job_id()).result_payload(), std::string("finished"), "Job completes after all callbacks");
  const auto remaining = DecodeBatch(service.Events(EventsRequest(submitted.job_id(), previous)));
  Expect(remaining.ByteSizeLong() < 4096, "Old cursor reaches terminal events without retained solutions");
}

using TestFn = void (*)();

int RunAllTests() {
  const std::vector<std::pair<std::string, TestFn>> tests = {
      {"AcknowledgedCallbackPayloadsAreReleasedWhileJobRuns", AcknowledgedCallbackPayloadsAreReleasedWhileJobRuns},
      {"CallbackRepliesAreCorrelatedAndCancellationWakesWaiters", CallbackRepliesAreCorrelatedAndCancellationWakesWaiters},
      {"DuplicateRegistrationPreservesExecutor", DuplicateRegistrationPreservesExecutor},
      {"StatusIsSnapshotAndDoesNotConsumeEvents", StatusIsSnapshotAndDoesNotConsumeEvents},
      {"EventsAreOrderedAndCursorBased", EventsAreOrderedAndCursorBased},
      {"ResultIsIndependentFromEvents", ResultIsIndependentFromEvents},
      {"FastJobCallbacksRemainAfterSubmissionCursor",
       FastJobCallbacksRemainAfterSubmissionCursor},
      {"EventStreamEndsWithSequencedResultAndResumes",
       EventStreamEndsWithSequencedResultAndResumes},
      {"QueuedJobsUsePollingInsteadOfHoldingEventStreams",
       QueuedJobsUsePollingInsteadOfHoldingEventStreams},
      {"ExecutorFailureMetadataIsPreserved", ExecutorFailureMetadataIsPreserved},
      {"CancellationUsesGenericProtocolAndInterruptsExecutor",
       CancellationUsesGenericProtocolAndInterruptsExecutor},
      {"CompletedJobsCanBeReleased", CompletedJobsCanBeReleased},
      {"RunningJobsCannotBeReleased", RunningJobsCannotBeReleased},
      {"CompletedJobsExpireWithoutExplicitRelease",
       CompletedJobsExpireWithoutExplicitRelease},
      {"RunningJobsDoNotExpire", RunningJobsDoNotExpire},
      {"DestructionDrainsSchedulerBeforeDestroyingExecutors",
       DestructionDrainsSchedulerBeforeDestroyingExecutors},
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
