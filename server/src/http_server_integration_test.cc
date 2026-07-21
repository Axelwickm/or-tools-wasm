#include "server/src/http_server.h"

#include <atomic>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include <httplib.h>
#include "job.pb.h"
#include "server/src/job_scheduler.h"
#include "server/src/solver_executor.h"
#include "server/src/solver_job_routes.h"
#include "server/src/solver_job_service.h"

namespace ortools_wasm::server {
namespace {

using namespace std::chrono_literals;
namespace bridge = ::ortools_wasm::bridge::v1;

constexpr int kPort = 17829;
constexpr int kTotalThreads = 8;
constexpr char kProtobufContentType[] = "application/x-protobuf";

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

struct ExecutionCounters {
  std::atomic<int> allocated_threads{0};
  std::atomic<int> maximum_allocated_threads{0};
  std::atomic<int> completed_jobs{0};
};

class FakeExecutor final : public SolverExecutor {
 public:
  explicit FakeExecutor(std::shared_ptr<ExecutionCounters> counters)
      : counters_(std::move(counters)) {}

  std::string solver() const override { return "fake"; }

  int RequestedThreads(const SolverExecutorRequest&, int client_requested_threads,
                       int server_total_threads) const override {
    const int requested = client_requested_threads > 0 ? client_requested_threads : 1;
    if (requested > server_total_threads) {
      throw std::invalid_argument("Requested thread count exceeds server capacity.");
    }
    return requested;
  }

  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context,
                               const SolverEventSink& emit_event) override {
    const int current =
        counters_->allocated_threads.fetch_add(context.allocated_threads()) +
        context.allocated_threads();
    int previous_maximum = counters_->maximum_allocated_threads.load();
    while (current > previous_maximum &&
           !counters_->maximum_allocated_threads.compare_exchange_weak(
               previous_maximum, current)) {
    }

    emit_event("started");
    if (request.payload == "control") {
      std::this_thread::sleep_for(1s);
    } else {
      std::this_thread::sleep_for(request.payload == "stream" ? 50ms : 3ms);
    }
    counters_->allocated_threads.fetch_sub(context.allocated_threads());
    counters_->completed_jobs.fetch_add(1);
    return SolverExecutorResult{true, "ok", {}};
  }

 private:
  std::shared_ptr<ExecutionCounters> counters_;
};

bridge::SolverBridgeResponse DecodeResponse(const httplib::Result& result,
                                             int expected_status,
                                             const std::string& operation) {
  Expect(static_cast<bool>(result), operation + " returns an HTTP response");
  ExpectEq(result->status, expected_status, operation + " HTTP status");
  bridge::SolverBridgeResponse response;
  Expect(response.ParseFromString(result->body), operation + " returns protobuf");
  return response;
}

bridge::SolverBridgeResponse SubmitJob(uint32_t request_id, int threads,
                                       std::string payload = "work") {
  bridge::SolverBridgeRequest request;
  request.set_request_id(request_id);
  request.set_solver("fake");
  request.set_execute_payload(std::move(payload));
  request.mutable_settings()->set_requested_threads(threads);
  httplib::Client client("127.0.0.1", kPort);
  return DecodeResponse(
      client.Post("/jobs", request.SerializeAsString(), kProtobufContentType),
      202, "submit");
}

bridge::SolverBridgeResponse WaitForResult(uint64_t job_id) {
  httplib::Client client("127.0.0.1", kPort);
  const std::string path = "/jobs/" + std::to_string(job_id) + "/result";
  const auto deadline = std::chrono::steady_clock::now() + 10s;
  while (std::chrono::steady_clock::now() < deadline) {
    auto result = client.Get(path);
    Expect(static_cast<bool>(result), "result polling returns an HTTP response");
    if (result->status == 204) {
      std::this_thread::sleep_for(2ms);
      continue;
    }
    return DecodeResponse(result, 200, "result");
  }
  throw TestFailure("timed out waiting for HTTP job result");
}

void ReleaseJob(uint64_t job_id) {
  httplib::Client client("127.0.0.1", kPort);
  const auto response = client.Delete("/jobs/" + std::to_string(job_id));
  Expect(static_cast<bool>(response), "release returns an HTTP response");
  ExpectEq(response->status, 204, "release HTTP status");
}

class RunningServer {
 public:
  RunningServer()
      : scheduler_({kTotalThreads, 512}),
        service_(scheduler_, 1h),
        server_(ServerConfig{"127.0.0.1", kPort, kTotalThreads, 512, 3600,
                             {}}) {
    service_.Register(std::make_unique<FakeExecutor>(counters_));
    server_.AddHealthRoute();
    AddSolverJobRoutes(server_, service_);
    thread_ = std::thread([this] { server_.Listen(); });

    httplib::Client client("127.0.0.1", kPort);
    const auto deadline = std::chrono::steady_clock::now() + 5s;
    while (std::chrono::steady_clock::now() < deadline) {
      const auto response = client.Get("/healthz");
      if (response && response->status == 200) return;
      std::this_thread::sleep_for(10ms);
    }
    server_.Stop();
    if (thread_.joinable()) thread_.join();
    throw TestFailure("HTTP test server did not become healthy");
  }

  ~RunningServer() {
    server_.Stop();
    if (thread_.joinable()) thread_.join();
  }

  std::shared_ptr<ExecutionCounters> counters() const { return counters_; }

 private:
  std::shared_ptr<ExecutionCounters> counters_ =
      std::make_shared<ExecutionCounters>();
  JobScheduler scheduler_;
  SolverJobService service_;
  HttpServer server_;
  std::thread thread_;
};

void ControlPlaneRemainsResponsiveWithActiveStreams() {
  std::vector<bridge::SolverBridgeResponse> submitted;
  submitted.reserve(kTotalThreads);
  for (int index = 0; index < kTotalThreads; ++index) {
    submitted.push_back(SubmitJob(2000 + index, 1, "control"));
  }

  std::atomic<int> clients_started{0};
  std::mutex errors_mutex;
  std::vector<std::string> errors;
  std::vector<std::thread> stream_clients;
  stream_clients.reserve(submitted.size());
  for (const auto& job : submitted) {
    stream_clients.emplace_back([&, job] {
      try {
        httplib::Client client("127.0.0.1", kPort);
        clients_started.fetch_add(1);
        const auto stream = client.Get(
            "/jobs/" + std::to_string(job.job_id()) + "/stream?after=" +
            std::to_string(job.sequence_id()));
        Expect(static_cast<bool>(stream), "active SSE request returns a response");
        ExpectEq(stream->status, 200, "active SSE request succeeds");
      } catch (const std::exception& error) {
        std::lock_guard lock(errors_mutex);
        errors.push_back(error.what());
      }
    });
  }
  while (clients_started.load() < kTotalThreads) std::this_thread::yield();
  std::this_thread::sleep_for(50ms);

  httplib::Client client("127.0.0.1", kPort);
  const auto started_at = std::chrono::steady_clock::now();
  const auto health = client.Get("/healthz");
  const auto elapsed = std::chrono::steady_clock::now() - started_at;
  for (auto& stream_client : stream_clients) stream_client.join();

  Expect(static_cast<bool>(health), "health check returns with active SSE streams");
  ExpectEq(health->status, 200, "health check succeeds with active SSE streams");
  Expect(elapsed < 500ms,
         "active SSE streams leave HTTP capacity for control requests");
  Expect(errors.empty(), errors.empty() ? "active SSE streams complete"
                                        : errors.front());
  for (const auto& job : submitted) ReleaseJob(job.job_id());
}

void HandlesConcurrentJobsAndStreamsLifecycleEvents() {
  RunningServer server;
  constexpr int kProducerCount = 8;
  constexpr int kJobsPerProducer = 16;
  std::mutex jobs_mutex;
  std::vector<uint64_t> job_ids;
  std::vector<std::string> errors;
  job_ids.reserve(kProducerCount * kJobsPerProducer);

  std::vector<std::thread> producers;
  for (int producer = 0; producer < kProducerCount; ++producer) {
    producers.emplace_back([&, producer] {
      try {
        for (int index = 0; index < kJobsPerProducer; ++index) {
          const uint32_t request_id =
              static_cast<uint32_t>(producer * kJobsPerProducer + index + 1);
          const int threads = 1 + ((producer + index) % 4);
          const auto response = SubmitJob(request_id, threads);
          Expect(response.job_id() > 0, "submit returns a job id");
          std::lock_guard lock(jobs_mutex);
          job_ids.push_back(response.job_id());
        }
      } catch (const std::exception& error) {
        std::lock_guard lock(jobs_mutex);
        errors.push_back(error.what());
      }
    });
  }
  for (auto& producer : producers) producer.join();

  Expect(errors.empty(), errors.empty() ? "concurrent submissions succeed"
                                        : errors.front());
  ExpectEq(job_ids.size(), static_cast<size_t>(kProducerCount * kJobsPerProducer),
           "all HTTP jobs are accepted");

  for (const uint64_t job_id : job_ids) {
    const auto result = WaitForResult(job_id);
    ExpectEq(result.payload_case(), bridge::SolverBridgeResponse::kResultPayload,
             "HTTP job returns a result payload");
    ExpectEq(result.result_payload(), std::string("ok"),
             "HTTP job result payload is preserved");
    ReleaseJob(job_id);
  }

  const auto counters = server.counters();
  ExpectEq(counters->completed_jobs.load(), kProducerCount * kJobsPerProducer,
           "all HTTP jobs execute exactly once");
  Expect(counters->maximum_allocated_threads.load() <= kTotalThreads,
         "HTTP jobs stay within the scheduler thread budget");
  Expect(counters->maximum_allocated_threads.load() > 1,
         "HTTP jobs execute in parallel");
  ExpectEq(counters->allocated_threads.load(), 0,
           "HTTP jobs return all allocated threads");

  const auto streamed = SubmitJob(1000, 1, "stream");
  httplib::Client client("127.0.0.1", kPort);
  const auto stream = client.Get(
      "/jobs/" + std::to_string(streamed.job_id()) + "/stream?after=" +
      std::to_string(streamed.sequence_id()));
  Expect(static_cast<bool>(stream), "SSE request returns an HTTP response");
  ExpectEq(stream->status, 200, "SSE HTTP status");
  Expect(stream->get_header_value("Content-Type").find("text/event-stream") !=
             std::string::npos,
         "SSE response has event-stream content type");
  Expect(stream->body.find("event: solver") != std::string::npos,
         "SSE response contains solver lifecycle events");
  ReleaseJob(streamed.job_id());

  ControlPlaneRemainsResponsiveWithActiveStreams();
}

}  // namespace
}  // namespace ortools_wasm::server

int main() {
  try {
    ortools_wasm::server::HandlesConcurrentJobsAndStreamsLifecycleEvents();
    std::cout << "[PASS] HandlesConcurrentJobsAndStreamsLifecycleEvents\n";
    return EXIT_SUCCESS;
  } catch (const std::exception& error) {
    std::cerr << "[FAIL] HandlesConcurrentJobsAndStreamsLifecycleEvents: "
              << error.what() << '\n';
    return EXIT_FAILURE;
  }
}
