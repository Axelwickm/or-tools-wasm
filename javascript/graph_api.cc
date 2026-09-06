// Minimal C API surface for OR-Tools graph/network-flow algorithms over WASM.
#include <cstdint>
#include <exception>
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

template <typename T>
void WriteVector(std::ostringstream& out, const std::vector<T>& values) {
  out << "[";
  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    if (i > 0) out << ",";
    out << values[i];
  }
  out << "]";
}

void WriteInt64Vector(std::ostringstream& out,
                      const std::vector<int64_t>& values) {
  out << "[";
  for (int i = 0; i < static_cast<int>(values.size()); ++i) {
    if (i > 0) out << ",";
    out << "\"" << values[i] << "\"";
  }
  out << "]";
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE const char* graph_max_flow_solve_serialized(
    const int32_t* tails_data, const int32_t* heads_data,
    const int64_t* capacities_data, int num_arcs, int source, int sink) {
  if ((num_arcs > 0 && (tails_data == nullptr || heads_data == nullptr ||
                        capacities_data == nullptr)) ||
      num_arcs < 0) {
    return ErrorResult("SimpleMaxFlow: invalid input pointers or dimensions.");
  }

  try {
    SimpleMaxFlow solver;
    for (int arc = 0; arc < num_arcs; ++arc) {
      solver.AddArcWithCapacity(tails_data[arc], heads_data[arc],
                                capacities_data[arc]);
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
        << ",\"optimalFlow\":\"" << solver.OptimalFlow() << "\""
        << ",\"numNodes\":" << solver.NumNodes()
        << ",\"numArcs\":" << solver.NumArcs() << ",\"flows\":";
    WriteInt64Vector(out, flows);
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
    const int32_t* tails_data, const int32_t* heads_data,
    const int64_t* capacities_data, const int64_t* unit_costs_data, int num_arcs,
    const int64_t* supplies_data, int num_supplies,
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
      solver.AddArcWithCapacityAndUnitCost(tails_data[arc], heads_data[arc],
                                           capacities_data[arc],
                                           unit_costs_data[arc]);
    }
    for (int node = 0; node < num_supplies; ++node) {
      solver.SetNodeSupply(node, supplies_data[node]);
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
        << ",\"optimalCost\":\"" << solver.OptimalCost() << "\""
        << ",\"maximumFlow\":\"" << solver.MaximumFlow() << "\""
        << ",\"numNodes\":" << solver.NumNodes()
        << ",\"numArcs\":" << solver.NumArcs() << ",\"flows\":";
    WriteInt64Vector(out, flows);
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SimpleMinCostFlow: unknown native error.");
  }
}

EMSCRIPTEN_KEEPALIVE const char* graph_linear_sum_assignment_solve_serialized(
    const int32_t* left_nodes_data, const int32_t* right_nodes_data,
    const int64_t* costs_data, int num_arcs) {
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
      solver.AddArcWithCost(left_nodes_data[arc], right_nodes_data[arc],
                            costs_data[arc]);
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
        << ",\"optimalCost\":\"" << solver.OptimalCost() << "\""
        << ",\"numNodes\":" << solver.NumNodes()
        << ",\"numArcs\":" << solver.NumArcs() << ",\"rightMates\":";
    WriteVector(out, right_mates);
    out << ",\"assignmentCosts\":";
    WriteInt64Vector(out, assignment_costs);
    out << "}";
    return StoreString(out.str());
  } catch (const std::exception& e) {
    return ErrorResult(e.what());
  } catch (...) {
    return ErrorResult("SimpleLinearSumAssignment: unknown native error.");
  }
}

}  // extern "C"
