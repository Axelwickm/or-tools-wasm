#ifndef ORTOOLS_WASM_SERVER_MATHOPT_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_MATHOPT_EXECUTOR_H_

#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>
#include "javascript/session_registry.h"

#include "server/src/solver_executor.h"

namespace ortools_wasm::server {

class MathOptExecutor final : public SolverExecutor {
 public:
  explicit MathOptExecutor(SessionLimits limits = ServerSessionLimits()) : sessions_(limits) {}
  void ExpireIdleSessions() override { sessions_.ExpireIdle(); }
  std::string solver() const override;
  int RequestedThreads(const SolverExecutorRequest& request,
                       int client_requested_threads,
                       int server_total_threads) const override;
  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context,
                               const SolverEventSink& emit_event) override;

 private:
  struct Session;
  std::shared_ptr<Session> FindSession(uint64_t handle);

  SessionRegistry<Session> sessions_;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_MATHOPT_EXECUTOR_H_
