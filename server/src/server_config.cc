#include "server/src/server_config.h"

#include <algorithm>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <thread>

namespace ortools_wasm::server {
namespace {

std::string RequiredStringEnv(const EnvLookup& env, const std::string& name) {
  const std::optional<std::string> value = env(name);
  if (!value.has_value() || value->empty()) {
    throw std::runtime_error("Missing required environment variable: " + name);
  }
  return *value;
}

int RequiredPositiveEnv(const EnvLookup& env, const std::string& name) {
  const std::string value = RequiredStringEnv(env, name);
  try {
    size_t consumed = 0;
    const int parsed = std::stoi(value, &consumed);
    if (parsed > 0 && consumed == value.size()) return parsed;
  } catch (...) {
  }
  throw std::runtime_error("Environment variable " + name +
                           " must be a positive integer.");
}

int OptionalPositiveEnv(const EnvLookup& env, const std::string& name, int fallback) {
  if (!env(name).has_value()) return fallback;
  return RequiredPositiveEnv(env, name);
}

int RequiredThreadBudgetEnv(const EnvLookup& env, const std::string& name) {
  const std::string value = RequiredStringEnv(env, name);
  if (value == "auto") {
    return static_cast<int>(std::max(1u, std::thread::hardware_concurrency()));
  }
  return RequiredPositiveEnv(env, name);
}

int RequiredPortEnv(const EnvLookup& env, const std::string& name) {
  const int port = RequiredPositiveEnv(env, name);
  if (port > 65535) {
    throw std::runtime_error("Environment variable " + name +
                             " must be between 1 and 65535.");
  }
  return port;
}

std::string OptionalStringEnv(const EnvLookup& env, const std::string& name) {
  const std::optional<std::string> value = env(name);
  return value.value_or("");
}

}  // namespace

ServerConfig LoadServerConfig(EnvLookup env) {
  return ServerConfig{
      RequiredStringEnv(env, "ORTOOLS_SERVER_HOST"),
      RequiredPortEnv(env, "ORTOOLS_SERVER_PORT"),
      RequiredThreadBudgetEnv(env, "ORTOOLS_SERVER_TOTAL_THREADS"),
      RequiredPositiveEnv(env, "ORTOOLS_SERVER_MAX_QUEUE_SIZE"),
      RequiredPositiveEnv(env,
                          "ORTOOLS_SERVER_COMPLETED_JOB_RETENTION_SECONDS"),
      OptionalStringEnv(env, "ORTOOLS_SERVER_BEARER_TOKEN"),
      OptionalPositiveEnv(env, "ORTOOLS_SERVER_EVENT_HISTORY_MAX_EVENTS", 4096),
      OptionalPositiveEnv(env, "ORTOOLS_SERVER_EVENT_HISTORY_MAX_BYTES", 16 * 1024 * 1024),
      OptionalPositiveEnv(env, "ORTOOLS_SERVER_MAX_SESSIONS_PER_SOLVER", 64),
      OptionalPositiveEnv(env, "ORTOOLS_SERVER_SESSION_IDLE_TIMEOUT_SECONDS", 1800),
  };
}

ServerConfig LoadServerConfigFromEnv() {
  return LoadServerConfig([](const std::string& name) -> std::optional<std::string> {
    const char* value = std::getenv(name.c_str());
    if (value == nullptr) return std::nullopt;
    return std::string(value);
  });
}

}  // namespace ortools_wasm::server
