#ifndef ORTOOLS_WASM_SERVER_SERVER_CONFIG_H_
#define ORTOOLS_WASM_SERVER_SERVER_CONFIG_H_

#include <functional>
#include <optional>
#include <string>

namespace ortools_wasm::server {

struct ServerConfig {
  std::string host;
  int port = 0;
  int total_threads = 0;
  int max_queue_size = 0;
  int completed_job_retention_seconds = 0;
  std::string bearer_token;
};

using EnvLookup = std::function<std::optional<std::string>(const std::string&)>;

ServerConfig LoadServerConfig(EnvLookup env);
ServerConfig LoadServerConfigFromEnv();

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_SERVER_CONFIG_H_
