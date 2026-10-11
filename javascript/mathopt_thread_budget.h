#ifndef ORTOOLS_WASM_MATHOPT_THREAD_BUDGET_H_
#define ORTOOLS_WASM_MATHOPT_THREAD_BUDGET_H_
#include "ortools/math_opt/rpc.pb.h"
namespace ortools_wasm {
// Follow each native backend's merge order, including solver-specific overrides.
inline int MathOptThreadRequirement(const operations_research::math_opt::SolveRequest& request) {
  using namespace operations_research::math_opt;
  const auto& parameters = request.parameters();
  const int common = parameters.has_threads() ? parameters.threads() : 1;
  switch (request.solver_type()) {
    case SOLVER_TYPE_CP_SAT: {
      const auto& sat = parameters.cp_sat();
      const int modern = sat.has_num_workers() ? sat.num_workers() : (parameters.has_threads() ? common : 0);
      if (modern != 0) return modern;
      return sat.num_search_workers() != 0 ? sat.num_search_workers() : common;
    }
    case SOLVER_TYPE_PDLP:
      return parameters.pdlp().has_num_threads() ? parameters.pdlp().num_threads() : common;
    case SOLVER_TYPE_GLOP:
      return parameters.glop().has_num_omp_threads() ? parameters.glop().num_omp_threads() : common;
    case SOLVER_TYPE_GSCIP: {
      const auto found = parameters.gscip().int_params().find("parallel/maxnthreads");
      return found == parameters.gscip().int_params().end() ? common : found->second;
    }
    default: return common;
  }
}
inline void BindMathOptAutomaticWorkers(operations_research::math_opt::SolveRequest* request,
                                        int budget) {
  using namespace operations_research::math_opt;
  if (request->solver_type() != SOLVER_TYPE_CP_SAT) return;
  auto* parameters = request->mutable_parameters();
  auto* sat = parameters->mutable_cp_sat();
  if (sat->num_workers() == 0 && sat->num_search_workers() == 0)
    sat->set_num_workers(budget);
}
}  // namespace ortools_wasm
#endif
