#ifndef ORTOOLS_WASM_CP_SAT_STATISTICS_H_
#define ORTOOLS_WASM_CP_SAT_STATISTICS_H_
#include <string>
#include "ortools/sat/cp_model.pb.h"
#include "ortools/sat/cp_model_checker.h"
#include "ortools/sat/cp_model_solver.h"
namespace ortools_wasm {
struct CpSatStatisticsResult { std::string report; std::string error; };
inline CpSatStatisticsResult CpSatStatistics(const std::string& bytes, bool response) {
  using namespace operations_research::sat;
  if (response) {
    CpSolverResponse proto;
    if (!proto.ParseFromString(bytes)) return {{}, "Failed to parse CpSolverResponse."};
    return {CpSolverResponseStats(proto), {}};
  }
  CpModelProto proto;
  if (!proto.ParseFromString(bytes)) return {{}, "Failed to parse CpModelProto."};
  const std::string error = ValidateCpModel(proto);
  if (!error.empty()) return {{}, error};
  return {CpModelStats(proto), {}};
}
}  // namespace ortools_wasm
#endif
