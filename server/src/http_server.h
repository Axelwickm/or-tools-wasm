#ifndef ORTOOLS_WASM_SERVER_HTTP_SERVER_H_
#define ORTOOLS_WASM_SERVER_HTTP_SERVER_H_

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "server/src/server_config.h"

namespace ortools_wasm::server {

struct HttpBinaryRequest {
  std::string body;
  std::map<std::string, std::string> headers;
  std::map<std::string, std::string> query_parameters;
  std::vector<std::string> path_matches;
};

struct HttpBinaryResponse {
  int status = 200;
  std::string body;
  std::string content_type = "application/octet-stream";
  std::map<std::string, std::string> headers;
};

using HttpBinaryHandler = std::function<HttpBinaryResponse(const HttpBinaryRequest&)>;

class HttpServer {
 public:
  explicit HttpServer(ServerConfig config);
  ~HttpServer();

  HttpServer(const HttpServer&) = delete;
  HttpServer& operator=(const HttpServer&) = delete;

  void AddHealthRoute();
  void AddGetRoute(const std::string& path, HttpBinaryHandler handler);
  void AddPostRoute(const std::string& path, HttpBinaryHandler handler);
  void AddDeleteRoute(const std::string& path, HttpBinaryHandler handler);
  bool Listen();
  void Stop();

 private:
  class Impl;

  std::unique_ptr<Impl> impl_;
};

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_HTTP_SERVER_H_
