#ifndef ORTOOLS_WASM_SERVER_SOLVER_JOB_SERVICE_H_
#define ORTOOLS_WASM_SERVER_SOLVER_JOB_SERVICE_H_

#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>

#include "server/src/http_server.h"
#include "server/src/job_scheduler.h"
#include "server/src/solver_executor.h"
#include "job.pb.h"

namespace ortools_wasm::server {

class SolverJobService {
 public:
  SolverJobService(JobScheduler& scheduler,
                   std::chrono::milliseconds completed_job_retention);
  ~SolverJobService();

  SolverJobService(const SolverJobService&) = delete;
  SolverJobService& operator=(const SolverJobService&) = delete;

  void Register(std::unique_ptr<SolverExecutor> executor);

  HttpBinaryResponse Submit(const HttpBinaryRequest& request);
  HttpBinaryResponse Status(const HttpBinaryRequest& request);
  HttpBinaryResponse Events(const HttpBinaryRequest& request);
  HttpEventStreamResponse StreamEvents(const HttpBinaryRequest& request);
  HttpBinaryResponse Result(const HttpBinaryRequest& request);
  HttpBinaryResponse Cancel(const HttpBinaryRequest& request);
  HttpBinaryResponse Release(const HttpBinaryRequest& request);

 private:
  struct JobEntry;

  SolverExecutor* ExecutorFor(const std::string& solver) const;
  std::shared_ptr<JobEntry> EntryFor(uint64_t job_id) const;
  void CleanupExpiredJobs();

  HttpBinaryResponse StatusResponse(uint32_t request_id, const JobStatus& status,
                                    int http_status) const;
  HttpBinaryResponse FailureResponse(uint32_t request_id, const std::string& solver,
                                     uint64_t job_id, std::string message,
                                     int http_status,
                                     ::ortools_wasm::bridge::v1::SolverFailureKind kind =
                                         ::ortools_wasm::bridge::v1::SOLVER_FAILURE_KIND_EXECUTOR_ERROR,
                                     bool retryable = false,
                                     std::string trace = {}) const;
  HttpBinaryResponse ResultResponse(uint32_t request_id, const std::string& solver,
                                    uint64_t job_id, const std::string& payload) const;

  JobScheduler& scheduler_;
  std::chrono::milliseconds completed_job_retention_;
  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::unique_ptr<SolverExecutor>> executors_;
  std::unordered_map<uint64_t, std::shared_ptr<JobEntry>> jobs_;
  std::mutex cleanup_mutex_;
  std::condition_variable cleanup_cv_;
  bool stop_cleanup_ = false;
  std::thread cleanup_thread_;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_SOLVER_JOB_SERVICE_H_
