#ifndef ORTOOLS_WASM_SERVER_SET_COVER_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_SET_COVER_EXECUTOR_H_

#include "server/src/solver_executor.h"
#include <memory>
#include "javascript/session_registry.h"

namespace ortools_wasm { class SetCoverGuidedSessions; }

namespace ortools_wasm::server {

class SetCoverExecutor final : public SolverExecutor {
 public:
  explicit SetCoverExecutor(SessionLimits limits = ServerSessionLimits());
  void ExpireIdleSessions() override;
  ~SetCoverExecutor() override;
  std::string solver() const override;
  int RequestedThreads(const SolverExecutorRequest& request,
                       int client_requested_threads,
                       int server_total_threads) const override;
  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context,
                               const SolverEventSink& emit_event) override;
 private:
  std::unique_ptr<ortools_wasm::SetCoverGuidedSessions> sessions_;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_SET_COVER_EXECUTOR_H_
