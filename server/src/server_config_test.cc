#include "server/src/server_config.h"

#include <cstdlib>
#include <exception>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace ortools_wasm::server {
namespace {

class TestFailure : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

void Expect(bool condition, const std::string& message) {
  if (!condition) throw TestFailure(message);
}

template <typename Lhs, typename Rhs>
void ExpectEq(const Lhs& lhs, const Rhs& rhs, const std::string& message) {
  if (!(lhs == rhs)) throw TestFailure(message);
}

EnvLookup MapEnv(std::unordered_map<std::string, std::string> values) {
  return [values = std::move(values)](const std::string& name) -> std::optional<std::string> {
    const auto it = values.find(name);
    if (it == values.end()) return std::nullopt;
    return it->second;
  };
}

std::unordered_map<std::string, std::string> ValidEnv() {
  return {
      {"ORTOOLS_SERVER_HOST", "0.0.0.0"},
      {"ORTOOLS_SERVER_PORT", "17827"},
      {"ORTOOLS_SERVER_TOTAL_THREADS", "4"},
      {"ORTOOLS_SERVER_MAX_QUEUE_SIZE", "100000"},
      {"ORTOOLS_SERVER_BEARER_TOKEN", "secret"},
  };
}

void LoadsValidConfig() {
  const ServerConfig config = LoadServerConfig(MapEnv(ValidEnv()));

  ExpectEq(config.host, std::string("0.0.0.0"), "host");
  ExpectEq(config.port, 17827, "port");
  ExpectEq(config.total_threads, 4, "total threads");
  ExpectEq(config.max_queue_size, 100000, "max queue size");
  ExpectEq(config.bearer_token, std::string("secret"), "bearer token");
}

void AllowsMissingBearerToken() {
  auto values = ValidEnv();
  values.erase("ORTOOLS_SERVER_BEARER_TOKEN");

  const ServerConfig config = LoadServerConfig(MapEnv(std::move(values)));
  Expect(config.bearer_token.empty(), "missing bearer token becomes empty");
}

void ResolvesAutoThreads() {
  auto values = ValidEnv();
  values["ORTOOLS_SERVER_TOTAL_THREADS"] = "auto";

  const ServerConfig config = LoadServerConfig(MapEnv(std::move(values)));
  Expect(config.total_threads > 0, "auto thread budget resolves to positive value");
}

void RejectsMissingRequiredValue() {
  auto values = ValidEnv();
  values.erase("ORTOOLS_SERVER_HOST");

  bool threw = false;
  try {
    LoadServerConfig(MapEnv(std::move(values)));
  } catch (const std::runtime_error& error) {
    threw = std::string(error.what()).find("ORTOOLS_SERVER_HOST") != std::string::npos;
  }
  Expect(threw, "missing host throws with variable name");
}

void RejectsInvalidPositiveInteger() {
  auto values = ValidEnv();
  values["ORTOOLS_SERVER_MAX_QUEUE_SIZE"] = "nope";

  bool threw = false;
  try {
    LoadServerConfig(MapEnv(std::move(values)));
  } catch (const std::runtime_error& error) {
    threw = std::string(error.what()).find("positive integer") != std::string::npos;
  }
  Expect(threw, "invalid max queue size throws");
}

void RejectsOutOfRangePort() {
  auto values = ValidEnv();
  values["ORTOOLS_SERVER_PORT"] = "70000";

  bool threw = false;
  try {
    LoadServerConfig(MapEnv(std::move(values)));
  } catch (const std::runtime_error& error) {
    threw = std::string(error.what()).find("between 1 and 65535") != std::string::npos;
  }
  Expect(threw, "out-of-range port throws");
}

struct TestCase {
  const char* name;
  void (*run)();
};

int RunAllTests() {
  const TestCase tests[] = {
      {"LoadsValidConfig", LoadsValidConfig},
      {"AllowsMissingBearerToken", AllowsMissingBearerToken},
      {"ResolvesAutoThreads", ResolvesAutoThreads},
      {"RejectsMissingRequiredValue", RejectsMissingRequiredValue},
      {"RejectsInvalidPositiveInteger", RejectsInvalidPositiveInteger},
      {"RejectsOutOfRangePort", RejectsOutOfRangePort},
  };

  int failures = 0;
  for (const auto& test : tests) {
    try {
      test.run();
      std::cout << "[PASS] " << test.name << '\n';
    } catch (const std::exception& error) {
      ++failures;
      std::cerr << "[FAIL] " << test.name << ": " << error.what() << '\n';
    } catch (...) {
      ++failures;
      std::cerr << "[FAIL] " << test.name << ": unknown exception" << '\n';
    }
  }
  return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}

}  // namespace
}  // namespace ortools_wasm::server

int main() {
  return ortools_wasm::server::RunAllTests();
}
