#ifndef ORTOOLS_WASM_SERVER_CP_SAT_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_CP_SAT_EXECUTOR_H_

#include "server/src/solver_executor.h"

namespace ortools_wasm::server {

class CpSatExecutor final : public SolverExecutor {
 public:
  std::string solver() const override;
  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context) override;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_CP_SAT_EXECUTOR_H_
