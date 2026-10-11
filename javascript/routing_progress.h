#ifndef ORTOOLS_WASM_ROUTING_PROGRESS_H_
#define ORTOOLS_WASM_ROUTING_PROGRESS_H_
#include <functional>
#include <utility>
#include "ortools/constraint_solver/constraint_solver.h"
#include "ortools/constraint_solver/routing.h"
namespace ortools_wasm {
// Keep checked solutions on Routing's native callback path. Fast local search
// has a distinct unchecked-neighbor event; report that distinction explicitly.
class RoutingUncheckedProgress : public operations_research::SearchMonitor {
 public:
  RoutingUncheckedProgress(operations_research::Solver* solver,
      std::function<void(bool)> callback)
      : SearchMonitor(solver), callback_(std::move(callback)) {}
  void AcceptUncheckedNeighbor() override { callback_(true); }
  void Install() override { ListenToEvent(operations_research::Solver::MonitorEvent::kAcceptUncheckedNeighbor); }
 private:
  std::function<void(bool)> callback_;
};
inline void AddRoutingProgress(operations_research::RoutingModel* model,
    bool unchecked, std::function<void(bool)> callback) {
  model->AddAtSolutionCallback([callback] { callback(false); });
  if (unchecked) model->AddSearchMonitor(model->solver()->RevAlloc(
      new RoutingUncheckedProgress(model->solver(), std::move(callback))));
}
}  // namespace ortools_wasm
#endif
