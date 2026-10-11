// Native COIN message forwarding shared by the CLP and CBC adapters.
#ifndef ORTOOLS_LINEAR_SOLVER_COIN_MESSAGE_CALLBACK_H_
#define ORTOOLS_LINEAR_SOLVER_COIN_MESSAGE_CALLBACK_H_

#include <functional>
#include <string>
#include <utility>

#include "CoinMessageHandler.hpp"

namespace operations_research {
class CoinMessageCallback : public CoinMessageHandler {
 public:
  explicit CoinMessageCallback(std::function<void(const std::string&)> callback)
      : callback_(std::move(callback)) {}
  CoinMessageHandler* clone() const override {
    return new CoinMessageCallback(*this);
  }
  int print() override {
    if (!callback_) return CoinMessageHandler::print();
    callback_(messageBuffer());
    return 0;
  }
 private:
  const std::function<void(const std::string&)> callback_;
};
}  // namespace operations_research
#endif  // ORTOOLS_LINEAR_SOLVER_COIN_MESSAGE_CALLBACK_H_
