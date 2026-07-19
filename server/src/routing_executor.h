#ifndef ORTOOLS_WASM_SERVER_ROUTING_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_ROUTING_EXECUTOR_H_

#include "server/src/solver_executor.h"

namespace ortools_wasm::server {

class RoutingExecutor final : public SolverExecutor {
 public:
  std::string solver() const override;
  int RequestedThreads(const SolverExecutorRequest& request,
                       int client_requested_threads,
                       int server_total_threads) const override;
  SolverExecutorResult Execute(const SolverExecutorRequest& request,
                               const JobContext& context,
                               const SolverEventSink& emit_event) override;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_ROUTING_EXECUTOR_H_
