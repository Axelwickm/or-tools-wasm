#include <cstdlib>
#include <exception>
#include <iostream>
#include <memory>

#include "absl/base/log_severity.h"
#include "absl/log/globals.h"
#include "ortools/base/init_google.h"
#include "server/src/cp_sat_executor.h"
#include "server/src/http_server.h"
#include "server/src/job_scheduler.h"
#include "server/src/server_config.h"
#include "server/src/solver_job_service.h"

namespace {

int RunHttpServer(const ortools_wasm::server::ServerConfig& config) {
  ortools_wasm::server::SchedulerOptions options;
  options.total_threads = config.total_threads;
  options.max_queue_size = config.max_queue_size;
  ortools_wasm::server::JobScheduler scheduler(options);
  ortools_wasm::server::SolverJobService job_service(scheduler);
  job_service.Register(std::make_unique<ortools_wasm::server::CpSatExecutor>());

  std::cout << "server http_bind=" << config.host << ":" << config.port << '\n';
  if (config.bearer_token.empty()) {
    std::cerr << "WARNING: ORTOOLS_SERVER_BEARER_TOKEN is unset. "
              << "The HTTP server will accept unauthenticated requests." << '\n';
  } else {
    std::cout << "server bearer_auth=enabled" << '\n';
  }
  std::cout << "scheduler total_threads=" << scheduler.Stats().total_threads
            << " max_queue_size=" << options.max_queue_size << '\n';

  ortools_wasm::server::HttpServer server(config);
  server.AddHealthRoute();
  server.AddPostRoute("/jobs", [&job_service](const ortools_wasm::server::HttpBinaryRequest& request) {
    return job_service.Submit(request);
  });
  server.AddGetRoute(R"(/jobs/(\d+))", [&job_service](const ortools_wasm::server::HttpBinaryRequest& request) {
    return job_service.Status(request);
  });
  server.AddGetRoute(R"(/jobs/(\d+)/result)", [&job_service](const ortools_wasm::server::HttpBinaryRequest& request) {
    return job_service.Result(request);
  });
  server.AddPostRoute(R"(/jobs/(\d+)/cancel)", [&job_service](const ortools_wasm::server::HttpBinaryRequest& request) {
    return job_service.Cancel(request);
  });

  std::cout << "server listening" << '\n';
  if (!server.Listen()) {
    std::cerr << "server failed to listen on " << config.host << ":" << config.port << '\n';
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

}  // namespace

int main(int argc, char* argv[]) {
  InitGoogle(argv[0], &argc, &argv, true);
  absl::SetStderrThreshold(absl::LogSeverityAtLeast::kInfo);
  try {
    return RunHttpServer(ortools_wasm::server::LoadServerConfigFromEnv());
  } catch (const std::exception& error) {
    std::cerr << "server configuration error: " << error.what() << '\n';
    return EXIT_FAILURE;
  }
}
