#ifndef ORTOOLS_WASM_SERVER_SOLVER_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_SOLVER_EXECUTOR_H_

#include <string>

#include "server/src/job_scheduler.h"

namespace ortools_wasm::server {

struct SolverExecutorRequest {
  uint32_t request_id = 0;
  std::string solver;
  std::string payload;
};

struct SolverExecutorResult {
  bool ok = true;
  std::string payload;
  std::string error_message;
};

class SolverExecutor {
 public:
  virtual ~SolverExecutor() = default;

  virtual std::string solver() const = 0;
  virtual SolverExecutorResult Execute(const SolverExecutorRequest& request,
                                       const JobContext& context) = 0;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_SOLVER_EXECUTOR_H_
