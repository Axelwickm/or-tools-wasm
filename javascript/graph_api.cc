// Minimal C API surface for OR-Tools graph/network-flow algorithms over WASM.
#include <cmath>
#include <cstdint>
#include <exception>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "ortools/graph/assignment.h"
#include "ortools/graph/max_flow.h"
#include "ortools/graph/min_cost_flow.h"

namespace {

using operations_research::SimpleLinearSumAssignment;
using operations_research::SimpleMaxFlow;
using operations_research::SimpleMinCostFlow;

std::string g_string_result;

const char* StoreString(std::string value) {
  g_string_result = std::move(value);
  return g_string_result.c_str();
}

std::string JsonEscape(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char ch : value) {
    if (ch == '\\' || ch == '"') {
      escaped.push_back('\\');
      escaped.push_back(ch);
    } else if (ch == '\n') {
      escaped += "\\n";
    } else if (ch == '\r') {
      escaped += "\\r";
    } else if (ch == '\t') {
      escaped += "\\t";
    } else {
      escaped.push_back(ch);
    }
  }
  return escaped;
}

const char* ErrorResult(const std::string& message) {
  std::ostringstream out;
  out << "{\"ok\":false,\"error\":\"" << JsonEscape(message) << "\"}";
  return StoreString(out.str());
}

int64_t NumberToInt64(double value, const char* field, int index) {
  if (!std::isfinite(value) || std::trunc(value) != value ||
      value < static_cast<double>(std::numeric_limits<int64_t>::min()) ||
      value > static_cast<double>(std::numeric_limits<int64_t>::max())) {
    std::ostringstream out;
    out << field << "[" << index << "] must be a finite int64 value.";
    throw std::invalid_argument(out.str());
  }
  return static_cast<int64_t>(value);
}

int32_t NumberToInt32(double value, const char* field, int index) {
  const int64_t int64_value = NumberToInt64(value, field, index);
  if (int64_value < std::numeric_limits<int32_t>::min() ||
      int64_value > std::numeric_limits<int32_t>::max()) {
    std::ostringstream out;
    out << field << "[" << index << "] must be in int32 range.";
    throw std::invalid_argument(out.str());
  }
  return static_cast<int32_t>(int64_value);
}

template <typename T>
void WriteVector(std::ostringstream& out, const std::vector<T>& values) {
  out << "[";
  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    if (i > 0) out << ",";
    out << values[i];
  }
  out << "]";
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* graph_max_flow_solve_serialized(
    const double* tails_data, const double* heads_data,
    const double* capacities_data, int num_arcs, int source, int sink) {
  if ((num_arcs > 0 && (tails_data == nullptr || heads_data == nullptr ||
                        capacities_data == nullptr)) ||
      num_arcs < 0) {
    return ErrorResult("SimpleMaxFlow: invalid input pointers or dimensions.");
  }

  try {
    SimpleMaxFlow solver;
    for (int arc = 0; arc < num_arcs; ++arc) {
      solver.AddArcWithCapacity(
          NumberToInt32(tails_data[arc], "tails", arc),
          NumberToInt32(heads_data[arc], "heads", arc),
          NumberToInt64(capacities_data[arc], "capacities", arc));
    }
    const int status = solver.Solve(source, sink);

    std::vector<int64_t> flows;
    std::vector<int32_t> source_side_min_cut;
    std::vector<int32_t> sink_side_min_cut;
    if (status == SimpleMaxFlow::OPTIMAL) {
      flows.reserve(num_arcs);
      for (int arc = 0; arc < num_arcs; ++arc) flows.push_back(solver.Flow(arc));
      solver.GetSourceSideMinCut(&source_side_min_cut);
      solver.GetSinkSideMinCut(&sink_side_min_cut);
    }

    std::ostringstream out;
    out << "{\"ok\":true,\"status\":" << status
        << ",\"optimalFlow\":" << solver.OptimalFlow()
        << ",\"numNodes\":" << solver.NumNodes()
        << ",\"numArcs\":" << solver.NumArcs() << ",\"flows\":";
    WriteVector(out, flows);
    out << ",\"sourceSideMinCut\":";
    WriteVector(out, source_side_min_cut);
    out << ",\"sinkSideMinCut\":";
    WriteVector(out, sink_side_min_cut);
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SimpleMaxFlow: unknown native error.");
  }
}

EMSCRIPTEN_KEEPALIVE const char* graph_min_cost_flow_solve_serialized(
    const double* tails_data, const double* heads_data,
    const double* capacities_data, const double* unit_costs_data, int num_arcs,
    const double* supplies_data, int num_supplies,
    int solve_max_flow_with_min_cost) {
  if ((num_arcs > 0 && (tails_data == nullptr || heads_data == nullptr ||
                        capacities_data == nullptr ||
                        unit_costs_data == nullptr)) ||
      (num_supplies > 0 && supplies_data == nullptr) || num_arcs < 0 ||
      num_supplies < 0) {
    return ErrorResult(
        "SimpleMinCostFlow: invalid input pointers or dimensions.");
  }

  try {
    SimpleMinCostFlow solver;
    for (int arc = 0; arc < num_arcs; ++arc) {
      solver.AddArcWithCapacityAndUnitCost(
          NumberToInt32(tails_data[arc], "tails", arc),
          NumberToInt32(heads_data[arc], "heads", arc),
          NumberToInt64(capacities_data[arc], "capacities", arc),
          NumberToInt64(unit_costs_data[arc], "unitCosts", arc));
    }
    for (int node = 0; node < num_supplies; ++node) {
      solver.SetNodeSupply(node, NumberToInt64(supplies_data[node], "supplies", node));
    }
    const int status = solve_max_flow_with_min_cost
                           ? solver.SolveMaxFlowWithMinCost()
                           : solver.Solve();

    std::vector<int64_t> flows;
    if (status == SimpleMinCostFlow::OPTIMAL ||
        status == SimpleMinCostFlow::FEASIBLE) {
      flows.reserve(num_arcs);
      for (int arc = 0; arc < num_arcs; ++arc) flows.push_back(solver.Flow(arc));
    }

    std::ostringstream out;
    out << "{\"ok\":true,\"status\":" << status
        << ",\"optimalCost\":" << solver.OptimalCost()
        << ",\"maximumFlow\":" << solver.MaximumFlow()
        << ",\"numNodes\":" << solver.NumNodes()
        << ",\"numArcs\":" << solver.NumArcs() << ",\"flows\":";
    WriteVector(out, flows);
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SimpleMinCostFlow: unknown native error.");
  }
}

EMSCRIPTEN_KEEPALIVE const char* graph_linear_sum_assignment_solve_serialized(
    const double* left_nodes_data, const double* right_nodes_data,
    const double* costs_data, int num_arcs) {
  if ((num_arcs > 0 && (left_nodes_data == nullptr ||
                        right_nodes_data == nullptr || costs_data == nullptr)) ||
      num_arcs < 0) {
    return ErrorResult(
        "SimpleLinearSumAssignment: invalid input pointers or dimensions.");
  }

  try {
    SimpleLinearSumAssignment solver;
    solver.ReserveArcs(num_arcs);
    for (int arc = 0; arc < num_arcs; ++arc) {
      solver.AddArcWithCost(
          NumberToInt32(left_nodes_data[arc], "leftNodes", arc),
          NumberToInt32(right_nodes_data[arc], "rightNodes", arc),
          NumberToInt64(costs_data[arc], "costs", arc));
    }
    const int status = solver.Solve();

    std::vector<int32_t> right_mates;
    std::vector<int64_t> assignment_costs;
    if (status == SimpleLinearSumAssignment::OPTIMAL) {
      right_mates.reserve(solver.NumNodes());
      assignment_costs.reserve(solver.NumNodes());
      for (int node = 0; node < solver.NumNodes(); ++node) {
        right_mates.push_back(solver.RightMate(node));
        assignment_costs.push_back(solver.AssignmentCost(node));
      }
    }

    std::ostringstream out;
    out << "{\"ok\":true,\"status\":" << status
        << ",\"optimalCost\":" << solver.OptimalCost()
        << ",\"numNodes\":" << solver.NumNodes()
        << ",\"numArcs\":" << solver.NumArcs() << ",\"rightMates\":";
    WriteVector(out, right_mates);
    out << ",\"assignmentCosts\":";
    WriteVector(out, assignment_costs);
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SimpleLinearSumAssignment: unknown native error.");
  }
}

}  // extern "C"
