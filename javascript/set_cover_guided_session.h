#ifndef ORTOOLS_WASM_SET_COVER_GUIDED_SESSION_H_
#define ORTOOLS_WASM_SET_COVER_GUIDED_SESSION_H_

#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <unordered_map>
#include <vector>
#include <utility>

#include "javascript/session_registry.h"
#include "javascript/set_cover_guided_tabu.h"
#include "ortools/set_cover/set_cover_invariant.h"

namespace ortools_wasm {

struct SetCoverGuidedSession {
  std::mutex mutex;
  bool closed = false;
  operations_research::SetCoverModel model;
  operations_research::SetCoverInvariant invariant;
  std::unique_ptr<operations_research::GuidedLocalSearch> local;
  std::unique_ptr<operations_research::GuidedTabuSearch> tabu;

  SetCoverGuidedSession(operations_research::SetCoverModel input,
      const operations_research::SubsetBoolVector& selected, bool guided_tabu,
      const GuidedTabuParameters& parameters)
      : model(std::move(input)), invariant(&model) {
    if (model.num_subsets() == 0) throw std::invalid_argument("Guided search requires at least one subset.");
    LoadCover(selected);
    if (guided_tabu) {
      tabu = std::make_unique<operations_research::GuidedTabuSearch>(&invariant);
    } else {
      local = std::make_unique<operations_research::GuidedLocalSearch>(&invariant);
    }
    Configure(parameters);
  }

  void RequireOpen() const {
    if (closed) throw std::runtime_error("Set Cover guided search is closed.");
  }

  void LoadCover(const operations_research::SubsetBoolVector& selected) {
    if (selected.get().size() != static_cast<size_t>(model.num_subsets())) throw std::invalid_argument("Set Cover session solution dimensions do not match.");
    invariant.LoadSolution(selected);
    invariant.Recompute(operations_research::SetCoverInvariant::ConsistencyLevel::kRedundancy);
    if (invariant.num_uncovered_elements() != 0) throw std::invalid_argument("Guided search requires a feasible starting cover.");
  }

  void Configure(const GuidedTabuParameters& parameters) {
    RequireOpen();
    if (tabu) ConfigureGuidedTabuSearch(tabu.get(), parameters);
    else if (parameters.lagrangian_factor || parameters.epsilon || parameters.penalty_factor || parameters.tabu_list_size) {
      throw std::invalid_argument("Guided tabu parameters require guided tabu search.");
    }
  }

  void Initialize(const operations_research::SubsetBoolVector& selected,
                  const GuidedTabuParameters& parameters) {
    RequireOpen();
    Configure(parameters);
    LoadCover(selected);
    if (tabu) tabu->Initialize(); else local->Initialize();
  }

  std::pair<double, double> RunTime() const {
    RequireOpen();
    const operations_research::SetCoverSolutionGenerator* generator = tabu ?
        static_cast<const operations_research::SetCoverSolutionGenerator*>(tabu.get()) : local.get();
    return {generator->run_time_in_seconds(), generator->run_time_in_microseconds()};
  }

  bool Next(const std::vector<operations_research::SubsetIndex>& focus, bool has_focus,
            double max_iterations, double time_limit, const GuidedTabuParameters& parameters) {
    RequireOpen();
    if (invariant.num_uncovered_elements() != 0) throw std::invalid_argument("Guided search requires a feasible starting cover.");
    if (max_iterations != std::numeric_limits<double>::infinity() &&
        (!std::isfinite(max_iterations) || max_iterations < 0 || std::trunc(max_iterations) != max_iterations || max_iterations >= 9223372036854775808.0)) {
      throw std::invalid_argument("SetCover: max iterations must be a non-negative int64 or positive infinity.");
    }
    if (std::isnan(time_limit) || time_limit < 0) throw std::invalid_argument("SetCover: time limit must be non-negative seconds or positive infinity.");
    for (const auto subset : focus) if (subset.value() < 0 || subset.value() >= model.num_subsets()) {
      throw std::invalid_argument("Invalid Set Cover session focus index.");
    }
    Configure(parameters);
    operations_research::SubsetListBasedSolutionGenerator* generator = tabu ?
        static_cast<operations_research::SubsetListBasedSolutionGenerator*>(tabu.get()) : local.get();
    generator->SetMaxIterations(std::isinf(max_iterations) ? std::numeric_limits<int64_t>::max() : static_cast<int64_t>(max_iterations));
    generator->SetTimeLimitInSeconds(time_limit);
    return has_focus ? generator->NextSolution(focus) : generator->NextSolution();
  }
};

// Opaque random IDs also keep stale server handles from aliasing a session after
// a server restart. Each executor owns its registry; jobs hold shared ownership.
class SetCoverGuidedSessions {
 public:
  explicit SetCoverGuidedSessions(SessionLimits limits = {}) : sessions_(limits) {}
  void ExpireIdle() { sessions_.ExpireIdle(); }
  uint64_t Create(operations_research::SetCoverModel model,
                  const operations_research::SubsetBoolVector& selected,
                  bool tabu, const GuidedTabuParameters& parameters) {
    auto session = std::make_shared<SetCoverGuidedSession>(std::move(model), selected, tabu, parameters);
    return sessions_.Insert(std::move(session));
  }

  std::shared_ptr<SetCoverGuidedSession> Find(uint64_t handle) {
    auto session = sessions_.Find(handle);
    if (!session) throw std::runtime_error("Set Cover guided search handle is unavailable, expired or closed.");
    return session;
  }

  void Delete(uint64_t handle) {
    auto session = sessions_.Find(handle);
    if (!session) return;
    std::lock_guard session_lock(session->mutex);
    session->closed = true;
    sessions_.Erase(handle);
  }

 private:
  SessionRegistry<SetCoverGuidedSession> sessions_;
};
}  // namespace ortools_wasm
#endif
