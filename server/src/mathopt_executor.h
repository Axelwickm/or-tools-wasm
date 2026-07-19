#ifndef ORTOOLS_WASM_SERVER_MATHOPT_EXECUTOR_H_
#define ORTOOLS_WASM_SERVER_MATHOPT_EXECUTOR_H_

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>

#include "server/src/solver_executor.h"

namespace ortools_wasm::server {

class MathOptExecutor final : public SolverExecutor {
 public:
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

  std::atomic<uint64_t> next_handle_{1};
  std::mutex sessions_mutex_;
  std::unordered_map<uint64_t, std::shared_ptr<Session>> sessions_;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_MATHOPT_EXECUTOR_H_
