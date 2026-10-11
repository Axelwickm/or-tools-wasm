#ifndef ORTOOLS_WASM_MP_SOLVER_SESSION_H_
#define ORTOOLS_WASM_MP_SOLVER_SESSION_H_

#include <cmath>
#include <functional>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

#include "absl/random/random.h"
#include "absl/time/time.h"
#include "mp_solver.pb.h"
#include "javascript/mp_solver_parameters.h"
#include "javascript/mp_solver_model_snapshot.h"
#include "ortools/linear_solver/linear_solver.h"
#include "ortools/linear_solver/linear_solver.pb.h"

namespace ortools_wasm {
namespace mp_session {
namespace bridge = ::ortools_wasm::bridge::v1;
using operations_research::MPModelRequest;
using operations_research::MPSolutionResponse;
using operations_research::MPSolver;
using operations_research::MPSolverParameters;

inline void FillMetadata(MPSolver& solver, const MPSolutionResponse& solution,
                         bridge::MpSolverNativeMetadata* metadata) {
  metadata->set_solver_version(solver.SolverVersion());
  metadata->set_iterations(solver.iterations());
  metadata->set_nodes(solver.IsMIP() ? solver.nodes() : -1);
  if (!solver.IsMIP() && solver.ProblemType() != MPSolver::PDLP_LINEAR_PROGRAMMING &&
      (solution.status() == operations_research::MPSOLVER_OPTIMAL ||
       solution.status() == operations_research::MPSOLVER_FEASIBLE)) {
    for (const auto* variable : solver.variables()) metadata->add_variable_basis_status(variable->basis_status());
    for (const auto* constraint : solver.constraints()) metadata->add_constraint_basis_status(constraint->basis_status());
    if (solver.ProblemType() == MPSolver::GLPK_LINEAR_PROGRAMMING)
      metadata->set_exact_condition_number(solver.ComputeExactConditionNumber());
  }
}

struct Session {
  std::mutex mutex;
  std::unique_ptr<MPSolver> solver;
  bool closed = false;
  bool failed = false;

  void RequireOpen() const {
    if (closed) throw std::invalid_argument("MPSolver session is closed.");
    if (failed) throw std::invalid_argument("MPSolver session failed; close it and create a new session.");
  }

  void Edit(const bridge::MpSolverEdit& edit) {
    using E = bridge::MpSolverEdit;
    const auto variable = [&](int index) {
      if (index < 0 || index >= solver->NumVariables()) throw std::invalid_argument("Invalid MPSolver session variable index.");
      return solver->variable(index);
    };
    const auto constraint = [&](int index) {
      if (index < 0 || index >= solver->NumConstraints()) throw std::invalid_argument("Invalid MPSolver session constraint index.");
      return solver->constraint(index);
    };
    const auto bounds = [&] {
      if (std::isnan(edit.first()) || std::isnan(edit.second())) throw std::invalid_argument("MPSolver session bounds must not be NaN.");
    };
    const auto finite = [&] {
      if (!std::isfinite(edit.first())) throw std::invalid_argument("MPSolver session coefficient must be finite.");
    };
    switch (edit.kind()) {
      case E::ADD_VARIABLE:
        bounds();
        if (edit.index() != solver->NumVariables()) throw std::invalid_argument("MPSolver session variables must be appended in order.");
        solver->MakeVar(edit.first(), edit.second(), edit.flag(), edit.name()); break;
      case E::ADD_CONSTRAINT:
        bounds();
        if (edit.index() != solver->NumConstraints()) throw std::invalid_argument("MPSolver session constraints must be appended in order.");
        solver->MakeRowConstraint(edit.first(), edit.second(), edit.name()); break;
      case E::VARIABLE_BOUNDS: bounds(); variable(edit.index())->SetBounds(edit.first(), edit.second()); break;
      case E::VARIABLE_INTEGER: variable(edit.index())->SetInteger(edit.flag()); break;
      case E::VARIABLE_PRIORITY:
        if (!std::isfinite(edit.first()) || edit.first() < -2147483648.0 || edit.first() > 2147483647.0 || std::trunc(edit.first()) != edit.first())
          throw std::invalid_argument("MPSolver branching priority must be an int32.");
        variable(edit.index())->SetBranchingPriority(static_cast<int>(edit.first())); break;
      case E::CONSTRAINT_BOUNDS: bounds(); constraint(edit.index())->SetBounds(edit.first(), edit.second()); break;
      case E::CONSTRAINT_COEFFICIENT: finite(); constraint(edit.index())->SetCoefficient(variable(edit.variable()), edit.first()); break;
      case E::CONSTRAINT_LAZY: constraint(edit.index())->set_is_lazy(edit.flag()); break;
      case E::CLEAR_CONSTRAINT: constraint(edit.index())->Clear(); break;
      case E::OBJECTIVE_COEFFICIENT: finite(); solver->MutableObjective()->SetCoefficient(variable(edit.index()), edit.first()); break;
      case E::OBJECTIVE_OFFSET: finite(); solver->MutableObjective()->SetOffset(edit.first()); break;
      case E::OBJECTIVE_DIRECTION: solver->MutableObjective()->SetOptimizationDirection(edit.flag()); break;
      case E::CLEAR_OBJECTIVE: solver->MutableObjective()->Clear(); break;
      case E::CLEAR: solver->Clear(); break;
      case E::HINT: {
        if (edit.hint_ids_size() != edit.hint_values_size()) throw std::invalid_argument("MPSolver hint dimensions do not match.");
        std::vector<std::pair<const operations_research::MPVariable*, double>> hint;
        for (int i = 0; i < edit.hint_ids_size(); ++i) {
          if (!std::isfinite(edit.hint_values(i))) throw std::invalid_argument("MPSolver hint must be finite.");
          hint.emplace_back(variable(edit.hint_ids(i)), edit.hint_values(i));
        }
        solver->SetHint(std::move(hint)); break;
      }
      default: throw std::invalid_argument("Unknown MPSolver session edit.");
    }
  }
};

// The registry owns real MPSolver instances. Jobs may run on different server
// threads; each session serializes its native operations and cleanup.
class Registry {
 public:
  explicit Registry(bool reject_glpk = false) : reject_glpk_(reject_glpk) {}

  std::shared_ptr<Session> Find(uint64_t handle) {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto found = sessions_.find(handle);
    if (found == sessions_.end()) throw std::invalid_argument("MPSolver session handle is invalid or closed.");
    return found->second;
  }

  bridge::MpSolverBridgeResponse Create(const bridge::MpSolverSessionCreateRequest& input) {
    MPModelRequest request;
    if (!request.ParseFromString(input.request_proto()) || !request.has_model()) throw std::invalid_argument("MPSolver session requires a valid MPModelRequest with a model.");
    const auto type = static_cast<MPSolver::OptimizationProblemType>(request.solver_type());
    if (!MPSolver::SupportsProblemType(type)) throw std::invalid_argument("MPSolver session backend is unavailable.");
    if (reject_glpk_ && (type == MPSolver::GLPK_LINEAR_PROGRAMMING || type == MPSolver::GLPK_MIXED_INTEGER_PROGRAMMING))
      throw std::invalid_argument("GLPK persistent server sessions are unsupported because its native environment belongs to the creating job thread.");
    auto session = std::make_shared<Session>();
    session->solver = std::make_unique<MPSolver>(request.model().name(), type);
    std::string error;
    const auto status = PopulateMpSolverSnapshot(request.model(), *session->solver, &error);
    if (status != operations_research::MPSOLVER_MODEL_IS_VALID) throw std::invalid_argument("MPSolver session model is invalid: " + error);
    std::lock_guard<std::mutex> lock(mutex_);
    uint64_t handle;
    do { handle = absl::Uniform<uint64_t>(random_, 1, uint64_t{1} << 53); } while (sessions_.count(handle));
    sessions_.emplace(handle, std::move(session));
    bridge::MpSolverBridgeResponse response;
    response.set_session_handle(handle);
    return response;
  }

  using SolveFunction = std::function<void(MPSolver&, const MPSolverParameters&)>;

  bridge::MpSolverBridgeResponse Run(const bridge::MpSolverSessionRunRequest& input,
                                     const SolveFunction& solve) {
    const auto session = Find(input.handle());
    std::lock_guard<std::mutex> lock(session->mutex);
    session->RequireOpen();
    auto& solver = *session->solver;
    bridge::MpSolverBridgeResponse response;
    auto* result = response.mutable_session_result();
    try {
      for (const auto& edit : input.edits()) session->Edit(edit);
      if (input.action() == bridge::MpSolverSessionRunRequest::RESET) { solver.Reset(); return response; }
      if (input.action() == bridge::MpSolverSessionRunRequest::NEXT_SOLUTION) {
        if (!solver.NextSolution()) return response;
      } else if (input.action() == bridge::MpSolverSessionRunRequest::SOLVE) {
        MPModelRequest request;
        if (!request.ParseFromString(input.solve().request_proto()) || request.has_model() || request.solver_type() != solver.ProblemType())
          throw std::invalid_argument("MPSolver session solve requires matching backend options without a model.");
        MPSolutionResponse solution;
        const int threads = input.solve().num_threads() > 0 ? input.solve().num_threads() : 1;
        if (!NormalizeMpSolverParameters(&request, threads, &solution)) {
          result->set_response_proto(solution.SerializeAsString()); return response;
        }
        if (threads > 1 || request.solver_type() == MPModelRequest::SAT_INTEGER_PROGRAMMING) {
          const auto status = solver.SetNumThreads(threads);
          if (!status.ok()) throw std::invalid_argument(std::string(status.message()));
        } else if (solver.GetNumThreads() != 1) {
          const auto status = solver.SetNumThreads(1);
          if (!status.ok()) throw std::invalid_argument(std::string(status.message()));
        }
        if (request.enable_internal_solver_output()) solver.EnableOutput(); else solver.SuppressOutput();
        solver.SetTimeLimit(request.has_solver_time_limit_seconds() ? absl::Seconds(request.solver_time_limit_seconds()) : absl::InfiniteDuration());
        if ((!request.solver_specific_parameters().empty() || !solver.GetSolverSpecificParametersAsString().empty()) &&
            !solver.SetSolverSpecificParametersAsString(request.solver_specific_parameters()) &&
            !request.ignore_solver_specific_parameters_failure()) {
          solution.set_status(operations_research::MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS);
          solution.set_status_str("MP Solver parameters could not be applied.");
          result->set_response_proto(solution.SerializeAsString()); return response;
        }
        MPSolverParameters parameters;
        for (const auto& [key, value] : input.solve().parameters().double_params()) parameters.SetDoubleParam(static_cast<MPSolverParameters::DoubleParam>(key), value);
        for (const auto& [key, value] : input.solve().parameters().integer_params()) parameters.SetIntegerParam(static_cast<MPSolverParameters::IntegerParam>(key), value);
        solve(solver, parameters);
      } else { throw std::invalid_argument("Unknown MPSolver session action."); }
      MPSolutionResponse solution;
      solver.FillSolutionResponseProto(&solution);
      result->set_has_solution(solution.status() == operations_research::MPSOLVER_OPTIMAL || solution.status() == operations_research::MPSOLVER_FEASIBLE);
      result->set_response_proto(solution.SerializeAsString());
      FillMetadata(solver, solution, result->mutable_metadata());
      return response;
    } catch (...) { session->failed = true; throw; }
  }

  bridge::MpSolverBridgeResponse Close(uint64_t handle) {
    bridge::MpSolverBridgeResponse response;
    response.mutable_session_result();
    std::shared_ptr<Session> session;
    {
      std::lock_guard<std::mutex> registry_lock(mutex_);
      const auto found = sessions_.find(handle);
      if (found == sessions_.end()) return response;
      session = found->second;
    }
    std::lock_guard<std::mutex> lock(session->mutex);
    if (session->closed) return response;
    session->closed = true;
    session->solver.reset();
    { std::lock_guard<std::mutex> registry_lock(mutex_); sessions_.erase(handle); }
    return response;
  }

 private:
  bool reject_glpk_;
  std::mutex mutex_;
  absl::BitGen random_;
  std::unordered_map<uint64_t, std::shared_ptr<Session>> sessions_;
};
}  // namespace mp_session
}  // namespace ortools_wasm
#endif  // ORTOOLS_WASM_MP_SOLVER_SESSION_H_
