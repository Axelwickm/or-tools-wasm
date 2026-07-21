#include "server/src/solver_job_routes.h"

#include "server/src/http_server.h"
#include "server/src/solver_job_service.h"

namespace ortools_wasm::server {

void AddSolverJobRoutes(HttpServer& server, SolverJobService& job_service) {
  server.AddPostRoute("/jobs", [&job_service](const HttpBinaryRequest& request) {
    return job_service.Submit(request);
  });
  server.AddGetRoute(R"(/jobs/(\d+))",
                     [&job_service](const HttpBinaryRequest& request) {
                       return job_service.Status(request);
                     });
  server.AddGetRoute(R"(/jobs/(\d+)/events)",
                     [&job_service](const HttpBinaryRequest& request) {
                       return job_service.Events(request);
                     });
  server.AddEventStreamRoute(
      R"(/jobs/(\d+)/stream)",
      [&job_service](const HttpBinaryRequest& request) {
        return job_service.StreamEvents(request);
      });
  server.AddGetRoute(R"(/jobs/(\d+)/result)",
                     [&job_service](const HttpBinaryRequest& request) {
                       return job_service.Result(request);
                     });
  server.AddPostRoute(R"(/jobs/(\d+)/cancel)",
                      [&job_service](const HttpBinaryRequest& request) {
                        return job_service.Cancel(request);
                      });
  server.AddDeleteRoute(R"(/jobs/(\d+))",
                        [&job_service](const HttpBinaryRequest& request) {
                          return job_service.Release(request);
                        });
}

}  // namespace ortools_wasm::server
