#ifndef ORTOOLS_WASM_MP_SOLVER_MESSAGES_H_
#define ORTOOLS_WASM_MP_SOLVER_MESSAGES_H_

#include <functional>
#include <stdexcept>
#include <string>
#include <utility>

#include "ortools/linear_solver/linear_solver.h"

namespace ortools_wasm {
// A retained native solver must not retain the observer of a completed job.
class ScopedMpSolverMessages {
 public:
  ScopedMpSolverMessages(operations_research::MPSolver& solver,
                        std::function<void(const std::string&)> callback)
      : solver_(solver) {
    if (!solver_.SetMessageCallback(std::move(callback)))
      throw std::invalid_argument("MPSolver backend does not support native message callbacks.");
  }
  ~ScopedMpSolverMessages() { solver_.SetMessageCallback(nullptr); }
  ScopedMpSolverMessages(const ScopedMpSolverMessages&) = delete;
  ScopedMpSolverMessages& operator=(const ScopedMpSolverMessages&) = delete;
 private:
  operations_research::MPSolver& solver_;
};
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MP_SOLVER_MESSAGES_H_
