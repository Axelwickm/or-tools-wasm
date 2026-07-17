#include "server/src/http_server.h"

#include <utility>

#include <httplib.h>
#include "job.pb.h"

namespace ortools_wasm::server {
namespace {

constexpr const char* kBinaryContentType = "application/octet-stream";
constexpr const char* kPlainTextContentType = "text/plain; charset=utf-8";

void AddCorsHeaders(httplib::Response& response) {
  response.set_header("Access-Control-Allow-Origin", "*");
  response.set_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  response.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

std::map<std::string, std::string> HeadersFromRequest(const httplib::Request& request) {
  std::map<std::string, std::string> headers;
  for (const auto& header : request.headers) {
    headers.emplace(header.first, header.second);
  }
  return headers;
}

std::vector<std::string> PathMatchesFromRequest(const httplib::Request& request) {
  std::vector<std::string> matches;
  for (size_t index = 1; index < request.matches.size(); ++index) {
    matches.push_back(request.matches[index].str());
  }
  return matches;
}

std::map<std::string, std::string> QueryParametersFromRequest(
    const httplib::Request& request) {
  std::map<std::string, std::string> parameters;
  for (const auto& parameter : request.params) {
    parameters.emplace(parameter.first, parameter.second);
  }
  return parameters;
}

void WriteResponse(const HttpBinaryResponse& source, httplib::Response& target) {
  target.status = source.status;
  AddCorsHeaders(target);
  for (const auto& header : source.headers) {
    target.set_header(header.first, header.second);
  }
  target.set_content(source.body, source.content_type.empty() ? kBinaryContentType
                                                             : source.content_type);
}

}  // namespace

class HttpServer::Impl {
 public:
  explicit Impl(ServerConfig config) : config_(std::move(config)) {}

  void AddHealthRoute() {
    server_.Get("/healthz", [](const httplib::Request&, httplib::Response& response) {
      AddCorsHeaders(response);
      response.set_content("ok\n", kPlainTextContentType);
    });
    server_.Options("/healthz", [](const httplib::Request&, httplib::Response& response) {
      AddCorsHeaders(response);
      response.status = 204;
    });
  }

  void AddGetRoute(const std::string& path, HttpBinaryHandler handler) {
    AddOptionsRoute(path);
    server_.Get(path, [this, handler = std::move(handler)](
                          const httplib::Request& request, httplib::Response& response) {
      if (!Authorize(request, response)) return;

      HttpBinaryRequest binary_request;
      binary_request.headers = HeadersFromRequest(request);
      binary_request.query_parameters = QueryParametersFromRequest(request);
      binary_request.path_matches = PathMatchesFromRequest(request);
      WriteResponse(handler(binary_request), response);
    });
  }

  void AddPostRoute(const std::string& path, HttpBinaryHandler handler) {
    AddOptionsRoute(path);
    server_.Post(path, [this, handler = std::move(handler)](
                           const httplib::Request& request, httplib::Response& response) {
      if (!Authorize(request, response)) return;

      HttpBinaryRequest binary_request;
      binary_request.body = request.body;
      binary_request.headers = HeadersFromRequest(request);
      binary_request.path_matches = PathMatchesFromRequest(request);
      WriteResponse(handler(binary_request), response);
    });
  }

  bool Listen() { return server_.listen(config_.host, config_.port); }

  void Stop() { server_.stop(); }

 private:
  void AddOptionsRoute(const std::string& path) {
    server_.Options(path, [](const httplib::Request&, httplib::Response& response) {
      AddCorsHeaders(response);
      response.status = 204;
    });
  }

  bool Authorize(const httplib::Request& request, httplib::Response& response) const {
    if (config_.bearer_token.empty()) return true;

    const std::string expected = "Bearer " + config_.bearer_token;
    if (request.get_header_value("Authorization") == expected) return true;

    response.status = 401;
    AddCorsHeaders(response);
    response.set_header("WWW-Authenticate", "Bearer");
    ::ortools_wasm::bridge::v1::SolverBridgeRequest bridge_request;
    bridge_request.ParseFromString(request.body);
    ::ortools_wasm::bridge::v1::SolverBridgeResponse bridge_response;
    bridge_response.set_request_id(bridge_request.request_id());
    bridge_response.set_solver(bridge_request.solver());
    auto* failure = bridge_response.mutable_failure();
    failure->set_request_id(bridge_request.request_id());
    failure->set_solver(bridge_request.solver());
    failure->set_kind(
        ::ortools_wasm::bridge::v1::SOLVER_FAILURE_KIND_UNAUTHENTICATED);
    failure->set_message("Authentication failed.");
    failure->set_retryable(false);
    response.set_content(bridge_response.SerializeAsString(),
                         "application/x-protobuf");
    return false;
  }

  ServerConfig config_;
  httplib::Server server_;
};

HttpServer::HttpServer(ServerConfig config) : impl_(std::make_unique<Impl>(std::move(config))) {}

HttpServer::~HttpServer() = default;

void HttpServer::AddHealthRoute() { impl_->AddHealthRoute(); }

void HttpServer::AddGetRoute(const std::string& path, HttpBinaryHandler handler) {
  impl_->AddGetRoute(path, std::move(handler));
}

void HttpServer::AddPostRoute(const std::string& path, HttpBinaryHandler handler) {
  impl_->AddPostRoute(path, std::move(handler));
}

bool HttpServer::Listen() { return impl_->Listen(); }

void HttpServer::Stop() { impl_->Stop(); }

}  // namespace ortools_wasm::server
