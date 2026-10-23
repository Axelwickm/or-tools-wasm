#ifndef ORTOOLS_WASM_SERVER_REMOTE_PARAMETERS_H_
#define ORTOOLS_WASM_SERVER_REMOTE_PARAMETERS_H_

#include <memory>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

#include "absl/strings/ascii.h"
#include "absl/strings/str_split.h"
#include "mathopt.pb.h"
#include "mp_solver.pb.h"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/math_opt/rpc.pb.h"
#include "scip/pub_paramset.h"
#include "scip/scip.h"
#include "scip/scip_param.h"
#include "scip/scipdefplugins.h"

namespace ortools_wasm::server {

// The one default-plugin SCIP string parameter that selects algorithm choices
// rather than files, external settings or plugin options. Fail closed for strings.
inline bool RemoteScipStringAllowed(const std::string& name) {
  return name == "heuristics/undercover/fixingalts";
}

inline const std::unordered_set<std::string>& BlockedRemoteScipStringParameters() {
  static const auto names = [] {
    SCIP* raw = nullptr;
    if (SCIPcreate(&raw) != SCIP_OKAY) throw std::runtime_error("Cannot inspect SCIP parameter metadata.");
    const auto release = [](SCIP* scip) { SCIPfree(&scip); };
    std::unique_ptr<SCIP, decltype(release)> owner(raw, release);
    if (SCIPincludeDefaultPlugins(raw) != SCIP_OKAY) throw std::runtime_error("Cannot inspect SCIP plugin parameters.");
    // Include shell-only and build-dependent file settings too.
    std::unordered_set<std::string> result{"display/logfile", "certificate/filename"};
    SCIP_PARAM** parameters = SCIPgetParams(raw);
    for (int i = 0; i < SCIPgetNParams(raw); ++i) {
      const std::string name = SCIPparamGetName(parameters[i]);
      if (SCIPparamGetType(parameters[i]) == SCIP_PARAMTYPE_STRING && !RemoteScipStringAllowed(name)) result.insert(name);
    }
    return result;
  }();
  return names;
}

inline void ValidateRemoteScipText(const std::string& text) {
  // Match LegacyScipSetSolverSpecificParameters' tokenization, without applying
  // anything: even ignored native parse failures may leave earlier values set.
  for (const auto parameter : absl::StrSplit(text, absl::ByAnyChar(",\n"), absl::SkipWhitespace())) {
    const std::vector<std::string> tokens = absl::StrSplit(parameter, absl::ByAnyChar("= "), absl::SkipWhitespace());
    // Native parsing stops here too; preserve its validation result.
    if (tokens.size() != 2) return;
    std::string name = tokens[0];
    absl::RemoveExtraAsciiWhitespace(&name);
    if (name.find('\0') != std::string::npos || BlockedRemoteScipStringParameters().count(name)) {
      throw std::invalid_argument("SCIP parameter is not permitted by server filesystem policy: " + name);
    }
  }
}

inline void ValidateRemoteMathOptParameters(const std::string& bytes) {
  operations_research::math_opt::SolveRequest request;
  if (!request.ParseFromString(bytes)) throw std::invalid_argument("Could not parse MathOpt SolveRequest.");
  const auto& parameters = request.parameters().gscip();
  if (!parameters.search_logs_filename().empty() || !parameters.detailed_solving_stats_filename().empty() ||
      !parameters.scip_model_filename().empty()) {
    throw std::invalid_argument("MathOpt filesystem output parameters are not permitted by the server.");
  }
  for (const auto& [name, value] : parameters.string_params()) {
    if (!RemoteScipStringAllowed(name)) throw std::invalid_argument("SCIP string parameter is not permitted by server filesystem policy: " + name);
  }
}

inline void ValidateRemoteParameters(const bridge::v1::MathOptBridgeRequest& request) {
  using Request = bridge::v1::MathOptBridgeRequest;
  switch (request.payload_case()) {
    case Request::kSolve: return ValidateRemoteMathOptParameters(request.solve().solve_request_proto());
    case Request::kIncrementalCreate: return ValidateRemoteMathOptParameters(request.incremental_create().solve_request_proto());
    case Request::kIncrementalSolve: return ValidateRemoteMathOptParameters(request.incremental_solve().solve_request_proto());
    case Request::kComputeInfeasibleSubsystem: return ValidateRemoteMathOptParameters(request.compute_infeasible_subsystem().solve_request_proto());
    default: return;
  }
}

inline void ValidateRemoteMpParameters(const std::string& bytes) {
  operations_research::MPModelRequest request;
  if (!request.ParseFromString(bytes)) throw std::invalid_argument("Could not parse MPModelRequest.");
  if (request.solver_type() == operations_research::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING)
    ValidateRemoteScipText(request.solver_specific_parameters());
}

inline void ValidateRemoteParameters(const bridge::v1::MpSolverBridgeRequest& request) {
  using Request = bridge::v1::MpSolverBridgeRequest;
  switch (request.payload_case()) {
    case Request::kSolve: return ValidateRemoteMpParameters(request.solve().request_proto());
    case Request::kSessionCreate: return ValidateRemoteMpParameters(request.session_create().request_proto());
    case Request::kSessionRun: return ValidateRemoteMpParameters(request.session_run().solve().request_proto());
    case Request::kValidateParameters:
      if (request.validate_parameters().solver_type() == operations_research::MPModelRequest::SCIP_MIXED_INTEGER_PROGRAMMING)
        ValidateRemoteScipText(request.validate_parameters().parameters());
      return;
    default: return;
  }
}

}  // namespace ortools_wasm::server
#endif
