#ifndef ORTOOLS_WASM_SERVER_MP_SOLVER_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_MP_SOLVER_EXECUTOR_H_

#include "server/src/solver_executor.h"
#include "javascript/mp_solver_session.h"

namespace ortools_wasm::server {

class MpSolverExecutor final : public SolverExecutor {
 public:
  explicit MpSolverExecutor(SessionLimits limits = ServerSessionLimits()) : sessions_(true, limits) {}
  void ExpireIdleSessions() override { sessions_.ExpireIdle(); }
  std::string solver() const override;
  int RequestedThreads(const SolverExecutorRequest& request,
                       int client_requested_threads,
                       int server_total_threads) const override;
  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context,
                               const SolverEventSink& emit_event) override;
 private:
  ortools_wasm::mp_session::Registry sessions_;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_MP_SOLVER_EXECUTOR_H_
