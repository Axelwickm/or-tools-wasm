#ifndef ORTOOLS_WASM_SERVER_SOLVER_JOB_ROUTES_H_
#define ORTOOLS_WASM_SERVER_SOLVER_JOB_ROUTES_H_

namespace ortools_wasm::server {

class HttpServer;
class SolverJobService;

void AddSolverJobRoutes(HttpServer& server, SolverJobService& job_service);

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_SOLVER_JOB_ROUTES_H_
