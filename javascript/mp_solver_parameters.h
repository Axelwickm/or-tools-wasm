// Keep backend-specific thread settings within the executor's reserved budget.
#ifndef ORTOOLS_WASM_MP_SOLVER_PARAMETERS_H_
#define ORTOOLS_WASM_MP_SOLVER_PARAMETERS_H_

#include <string>
#include "google/protobuf/text_format.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/pdlp/solvers.pb.h"
#include "ortools/port/proto_utils.h"
#include "ortools/sat/sat_parameters.pb.h"

namespace ortools_wasm {
// Return the backend setter's acceptance result; -1 means the backend is unavailable.
inline int ValidateMpSolverSpecificParameters(int solver_type, const std::string& parameters) {
  using operations_research::MPSolver;
  const auto type = static_cast<MPSolver::OptimizationProblemType>(solver_type);
  if (!MPSolver::SupportsProblemType(type)) return -1;
  MPSolver solver("", type);
  return solver.SetSolverSpecificParametersAsString(parameters) ? 1 : 0;
}

inline bool NormalizeMpSolverParameters(
    operations_research::MPModelRequest* request, int threads,
    operations_research::MPSolutionResponse* error) {
  using operations_research::MPModelRequest;
  const auto reject = [&](const std::string& detail) {
    error->set_status(operations_research::MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS);
    error->set_status_str(detail);
    return false;
  };
  threads = threads > 0 ? threads : 1;
  const auto parse = [&](auto* parameters) {
    return request->solver_specific_parameters().empty() ||
        operations_research::ProtobufTextFormatMergeFromString(
            request->solver_specific_parameters(), parameters) ||
        request->ignore_solver_specific_parameters_failure();
  };
  const auto store = [&](const auto& parameters) {
    std::string text;
    google::protobuf::TextFormat::PrintToString(parameters, &text);
    request->set_solver_specific_parameters(text);
  };
  if (request->solver_type() == MPModelRequest::SAT_INTEGER_PROGRAMMING) {
    operations_research::sat::SatParameters parameters;
    if (!parse(&parameters)) return reject("Invalid SAT solver-specific parameters.");
    const int modern = parameters.num_workers();
    const int legacy = parameters.num_search_workers();
    if (modern < 0 || legacy < 0 ||
        (modern > 0 && modern != threads) ||
        (legacy > 0 && legacy != threads)) {
      return reject("SAT num_workers/num_search_workers must match the reserved numThreads budget.");
    }
    // Native zero means automatic; automatic is bounded by the reserved budget.
    parameters.set_num_workers(threads);
    parameters.clear_num_search_workers();
    store(parameters);
  } else if (request->solver_type() == MPModelRequest::PDLP_LINEAR_PROGRAMMING) {
    operations_research::pdlp::PrimalDualHybridGradientParams parameters;
    if (!parse(&parameters)) return reject("Invalid PDLP solver-specific parameters.");
    if (parameters.has_num_threads() && parameters.num_threads() != threads) {
      return reject("PDLP num_threads must match the reserved numThreads budget.");
    }
    parameters.set_num_threads(threads);
    store(parameters);
  }
  return true;
}
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MP_SOLVER_PARAMETERS_H_
