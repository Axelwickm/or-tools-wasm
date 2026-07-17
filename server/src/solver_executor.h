#ifndef ORTOOLS_WASM_SERVER_SOLVER_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_SOLVER_EXECUTOR_H_

#include <functional>
#include <string>

#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {

struct SolverExecutorRequest {
  uint32_t request_id = 0;
  std::string solver;
  std::string payload;
};

enum class SolverExecutionFailureKind {
  kExecutor,
  kInvalidRequest,
  kCancelled,
  kInternal,
};

struct SolverExecutorResult {
  bool ok = true;
  std::string payload;
  std::string error_message;
  SolverExecutionFailureKind failure_kind = SolverExecutionFailureKind::kExecutor;
  std::string trace;
  bool retryable = false;
};

using SolverEventSink = std::function<void(std::string payload)>;

class SolverExecutor {
 public:
  virtual ~SolverExecutor() = default;

  virtual std::string solver() const = 0;
  virtual int RequestedThreads(const SolverExecutorRequest& request,
                               int client_requested_threads,
                               int server_total_threads) const = 0;
  virtual SolverExecutorResult Execute(const SolverExecutorRequest& request,
                                       const JobContext& context,
                                       const SolverEventSink& emit_event) = 0;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_SOLVER_EXECUTOR_H_
