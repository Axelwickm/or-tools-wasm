#include "server/src/pdlp_executor.h"

#include <atomic>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "Eigen/SparseCore"
#include "ortools/linear_solver/linear_solver.pb.h"
#include "ortools/pdlp/primal_dual_hybrid_gradient.h"
#include "ortools/pdlp/quadratic_program.h"
#include "ortools/pdlp/solvers.pb.h"
#include "pdlp.pb.h"

namespace ortools_wasm::server {
namespace {

namespace bridge = ::ortools_wasm::bridge::v1;
using ::operations_research::MPModelProto;
using ::operations_research::pdlp::IsLinearProgram;
using ::operations_research::pdlp::PrimalAndDualSolution;
using ::operations_research::pdlp::PrimalDualHybridGradient;
using ::operations_research::pdlp::PrimalDualHybridGradientParams;
using ::operations_research::pdlp::QpFromMpModelProto;
using ::operations_research::pdlp::QpToMpModelProto;
using ::operations_research::pdlp::QuadraticProgram;
using ::operations_research::pdlp::SetEigenMatrixFromTriplets;
using ::operations_research::pdlp::ValidateQuadraticProgramDimensions;

SolverExecutorResult Error(std::string message,
                           SolverExecutionFailureKind kind =
                               SolverExecutionFailureKind::kInvalidRequest) {
  SolverExecutorResult result;
  result.ok = false;
  result.error_message = std::move(message);
  result.failure_kind = kind;
  return result;
}

Eigen::VectorXd Vector(const google::protobuf::RepeatedField<double>& values) {
  Eigen::VectorXd result(values.size());
  for (int i = 0; i < values.size(); ++i) result[i] = values.Get(i);
  return result;
}

void AddVector(const Eigen::VectorXd& values,
               google::protobuf::RepeatedField<double>* output) {
  output->Reserve(values.size());
  for (int i = 0; i < values.size(); ++i) output->Add(values[i]);
}

absl::StatusOr<QuadraticProgram> DecodeQuadraticProgram(
    const bridge::PdlpQuadraticProgram& input) {
  if (input.num_variables() < 0 || input.num_constraints() < 0) {
    return absl::InvalidArgumentError("PDLP dimensions must be non-negative.");
  }
  QuadraticProgram qp(input.num_variables(), input.num_constraints());
  if (!input.problem_name().empty()) qp.problem_name = input.problem_name();
  qp.objective_offset = input.objective_offset();
  qp.objective_scaling_factor = input.objective_scaling_factor();
  qp.objective_vector = Vector(input.objective_vector());
  if (input.has_objective_matrix_diagonal()) {
    qp.objective_matrix.emplace();
    qp.objective_matrix->diagonal() = Vector(input.objective_matrix_diagonal());
  } else {
    qp.objective_matrix.reset();
  }
  qp.constraint_lower_bounds = Vector(input.constraint_lower_bounds());
  qp.constraint_upper_bounds = Vector(input.constraint_upper_bounds());
  qp.variable_lower_bounds = Vector(input.variable_lower_bounds());
  qp.variable_upper_bounds = Vector(input.variable_upper_bounds());
  if (!input.variable_names().empty()) {
    qp.variable_names = {input.variable_names().begin(), input.variable_names().end()};
  }
  if (!input.constraint_names().empty()) {
    qp.constraint_names = {input.constraint_names().begin(), input.constraint_names().end()};
  }
  std::vector<Eigen::Triplet<double, int64_t>> entries;
  entries.reserve(input.constraint_matrix_entries_size());
  for (const auto& entry : input.constraint_matrix_entries()) {
    if (entry.row() < 0 || entry.row() >= input.num_constraints() ||
        entry.column() < 0 || entry.column() >= input.num_variables()) {
      return absl::InvalidArgumentError("PDLP sparse matrix entry is out of range.");
    }
    entries.emplace_back(entry.row(), entry.column(), entry.value());
  }
  qp.constraint_matrix.resize(input.num_constraints(), input.num_variables());
  SetEigenMatrixFromTriplets(std::move(entries), qp.constraint_matrix);
  return qp;
}

void EncodeQuadraticProgram(const QuadraticProgram& qp,
                            bridge::PdlpQuadraticProgram* output) {
  output->set_num_variables(qp.objective_vector.size());
  output->set_num_constraints(qp.constraint_lower_bounds.size());
  output->set_problem_name(qp.problem_name.value_or(""));
  output->set_objective_offset(qp.objective_offset);
  output->set_objective_scaling_factor(qp.objective_scaling_factor);
  AddVector(qp.objective_vector, output->mutable_objective_vector());
  output->set_has_objective_matrix_diagonal(qp.objective_matrix.has_value());
  if (qp.objective_matrix) {
    AddVector(qp.objective_matrix->diagonal(),
              output->mutable_objective_matrix_diagonal());
  }
  AddVector(qp.constraint_lower_bounds, output->mutable_constraint_lower_bounds());
  AddVector(qp.constraint_upper_bounds, output->mutable_constraint_upper_bounds());
  AddVector(qp.variable_lower_bounds, output->mutable_variable_lower_bounds());
  AddVector(qp.variable_upper_bounds, output->mutable_variable_upper_bounds());
  for (const auto& name : qp.variable_names.value_or(std::vector<std::string>{})) {
    output->add_variable_names(name);
  }
  for (const auto& name : qp.constraint_names.value_or(std::vector<std::string>{})) {
    output->add_constraint_names(name);
  }
  for (int column = 0; column < qp.constraint_matrix.outerSize(); ++column) {
    for (Eigen::SparseMatrix<double, Eigen::ColMajor, int64_t>::InnerIterator it(
             qp.constraint_matrix, column);
         it; ++it) {
      auto* entry = output->add_constraint_matrix_entries();
      entry->set_row(it.row());
      entry->set_column(it.col());
      entry->set_value(it.value());
    }
  }
}

PrimalDualHybridGradientParams DecodeParameters(
    const bridge::PdlpSolveParameters& input) {
  PrimalDualHybridGradientParams params;
  if (input.has_iteration_limit()) {
    params.mutable_termination_criteria()->set_iteration_limit(input.iteration_limit());
  }
  if (input.has_termination_check_frequency()) {
    params.set_termination_check_frequency(input.termination_check_frequency());
  }
  if (input.has_eps_optimal_relative()) {
    params.mutable_termination_criteria()
        ->mutable_simple_optimality_criteria()
        ->set_eps_optimal_relative(input.eps_optimal_relative());
  }
  if (input.has_eps_optimal_absolute()) {
    params.mutable_termination_criteria()
        ->mutable_simple_optimality_criteria()
        ->set_eps_optimal_absolute(input.eps_optimal_absolute());
  }
  if (input.has_l_inf_ruiz_iterations()) {
    params.set_l_inf_ruiz_iterations(input.l_inf_ruiz_iterations());
  }
  if (input.has_l2_norm_rescaling()) {
    params.set_l2_norm_rescaling(input.l2_norm_rescaling());
  }
  return params;
}

SolverExecutorResult ExecuteRequest(const bridge::PdlpBridgeRequest& request,
                                    const JobContext& context) {
  bridge::PdlpBridgeResponse response;
  if (request.operation() == bridge::PDLP_OPERATION_FROM_MP_MODEL) {
    MPModelProto proto;
    if (!proto.ParseFromString(request.mp_model_proto())) {
      return Error("Failed to parse PDLP MPModelProto.");
    }
    auto qp = QpFromMpModelProto(proto, request.relax_integer_variables(),
                                 request.include_names());
    if (!qp.ok()) return Error(std::string(qp.status().message()));
    EncodeQuadraticProgram(*qp, response.mutable_quadratic_program());
  } else {
    if (!request.has_quadratic_program()) {
      return Error("PDLP operation requires a quadratic program.");
    }
    auto qp = DecodeQuadraticProgram(request.quadratic_program());
    if (!qp.ok()) return Error(std::string(qp.status().message()));
    switch (request.operation()) {
      case bridge::PDLP_OPERATION_VALIDATE: {
        const auto status = ValidateQuadraticProgramDimensions(*qp);
        if (!status.ok()) response.set_validation_error(status.message());
        break;
      }
      case bridge::PDLP_OPERATION_IS_LINEAR:
        response.set_is_linear(IsLinearProgram(*qp));
        break;
      case bridge::PDLP_OPERATION_TO_MP_MODEL: {
        auto proto = QpToMpModelProto(*qp);
        if (!proto.ok()) return Error(std::string(proto.status().message()));
        if (!proto->SerializeToString(response.mutable_mp_model_proto())) {
          return Error("Failed to serialize PDLP MPModelProto.");
        }
        break;
      }
      case bridge::PDLP_OPERATION_SOLVE: {
        std::optional<PrimalAndDualSolution> initial;
        if (request.has_initial_solution()) {
          initial.emplace();
          initial->primal_solution = Vector(request.initial_solution().primal_solution());
          initial->dual_solution = Vector(request.initial_solution().dual_solution());
        }
        std::atomic<bool> interrupted(context.cancellation_requested());
        auto cancellation = context.OnCancellation([&interrupted] { interrupted.store(true); });
        const auto result = PrimalDualHybridGradient(
            std::move(*qp), DecodeParameters(request.parameters()),
            std::move(initial), &interrupted);
        auto* output = response.mutable_solver_result();
        AddVector(result.primal_solution, output->mutable_primal_solution());
        AddVector(result.dual_solution, output->mutable_dual_solution());
        AddVector(result.reduced_costs, output->mutable_reduced_costs());
        output->set_termination_reason(result.solve_log.termination_reason());
        output->set_iteration_count(result.solve_log.iteration_count());
        break;
      }
      default:
        return Error("PDLP request has no operation.");
    }
  }
  std::string payload;
  if (!response.SerializeToString(&payload)) return Error("Failed to serialize PDLP response.");
  return SolverExecutorResult{true, std::move(payload), {}};
}

}  // namespace

std::string PdlpExecutor::solver() const { return "pdlp"; }

int PdlpExecutor::RequestedThreads(const SolverExecutorRequest& request,
                                   int client_requested_threads,
                                   int server_total_threads) const {
  bridge::PdlpBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) {
    throw std::invalid_argument("Failed to parse PDLP bridge request.");
  }
  if (client_requested_threads != 0 && client_requested_threads != 1) {
    throw std::invalid_argument("PDLP jobs currently require exactly one thread.");
  }
  if (server_total_threads < 1) throw std::invalid_argument("Server has no PDLP capacity.");
  return 1;
}

SolverExecutorResult PdlpExecutor::Execute(const SolverExecutorRequest& request,
                                           const JobContext& context,
                                           const SolverEventSink& emit_event) {
  (void)emit_event;
  bridge::PdlpBridgeRequest parsed;
  if (!parsed.ParseFromString(request.payload)) {
    return Error("Failed to parse PDLP bridge request.");
  }
  return ExecuteRequest(parsed, context);
}

}  // namespace ortools_wasm::server
