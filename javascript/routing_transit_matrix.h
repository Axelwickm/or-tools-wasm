#ifndef ORTOOLS_WASM_ROUTING_TRANSIT_MATRIX_H_
#define ORTOOLS_WASM_ROUTING_TRANSIT_MATRIX_H_
#include <cstdint>
#include <stdexcept>
#include <utility>
#include <vector>
#include "ortools/constraint_solver/routing.h"
namespace ortools_wasm {
inline int RegisterRoutingIndexTransitMatrix(operations_research::RoutingModel& model,
    std::vector<int64_t> values, int dimension, bool unary) {
  if (dimension != model.Size() + model.vehicles() || dimension <= 0 || values.size() != size_t(dimension) * dimension)
    throw std::invalid_argument("Routing transit matrix must match the index count.");
  if (unary) {
    std::vector<int64_t> transits;
    transits.reserve(dimension);
    for (int from = 0; from < dimension; ++from) {
      const int64_t value = values[size_t(from) * dimension];
      for (int to = 1; to < dimension; ++to)
        if (values[size_t(from) * dimension + to] != value) throw std::invalid_argument("Unary Routing transit must be independent of its destination.");
      transits.push_back(value);
    }
    return model.RegisterUnaryTransitCallback([transits = std::move(transits)](int64_t from) {
      return from >= 0 && from < transits.size() ? transits[from] : int64_t{0};
    });
  }
  return model.RegisterTransitCallback([values = std::move(values), dimension](int64_t from, int64_t to) {
    return from >= 0 && to >= 0 && from < dimension && to < dimension ? values[size_t(from) * dimension + to] : int64_t{0};
  });
}
}  // namespace ortools_wasm
#endif
