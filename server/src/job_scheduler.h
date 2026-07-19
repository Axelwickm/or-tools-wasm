#ifndef ORTOOLS_WASM_SERVER_JOB_SCHEDULER_H_
#define ORTOOLS_WASM_SERVER_JOB_SCHEDULER_H_

#include <atomic>
#include <cstdint>
#include <deque>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

namespace ortools_wasm::server {

class JobCancellationState;

enum class JobState {
  kQueued,
  kStarting,
  kRunning,
  kCancelling,
  kCancelled,
  kSucceeded,
  kFailed,
};

struct JobStatus {
  uint64_t job_id = 0;
  std::string solver;
  JobState state = JobState::kQueued;
  uint64_t created_at_ms = 0;
  uint64_t started_at_ms = 0;
  uint64_t completed_at_ms = 0;
  int requested_threads = 1;
  int allocated_threads = 1;
  int queue_position = 0;
  std::string message;
};

struct JobResult {
  JobState state = JobState::kSucceeded;
  std::string message;

  static JobResult Succeeded(std::string message = {});
  static JobResult Cancelled(std::string message = {});
  static JobResult Failed(std::string message);
};

struct JobSpec {
  std::string solver;
  int requested_threads = 1;
};

struct SchedulerOptions {
  int total_threads = 0;
  int max_queue_size = 0;
};

struct SchedulerStats {
  int total_threads = 0;
  int available_threads = 0;
  int active_jobs = 0;
  int queued_jobs = 0;
};

class JobQueueFullError : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

class CancellationRegistration {
 public:
  CancellationRegistration() = default;
  ~CancellationRegistration();

  CancellationRegistration(CancellationRegistration&& other) noexcept;
  CancellationRegistration& operator=(CancellationRegistration&& other) noexcept;
  CancellationRegistration(const CancellationRegistration&) = delete;
  CancellationRegistration& operator=(const CancellationRegistration&) = delete;

 private:
  friend class JobContext;

  CancellationRegistration(std::shared_ptr<JobCancellationState> state,
                           uint64_t handler_id);
  void Reset();

  std::shared_ptr<JobCancellationState> state_;
  uint64_t handler_id_ = 0;
};

class JobContext {
 public:
  uint64_t job_id() const { return job_id_; }
  const std::string& solver() const { return solver_; }
  int requested_threads() const { return requested_threads_; }
  int allocated_threads() const { return allocated_threads_; }
  bool cancellation_requested() const;
  CancellationRegistration OnCancellation(std::function<void()> handler) const;

 private:
  friend class JobScheduler;

  JobContext(uint64_t job_id, std::string solver, int requested_threads,
             int allocated_threads,
             std::shared_ptr<JobCancellationState> cancellation);

  uint64_t job_id_;
  std::string solver_;
  int requested_threads_;
  int allocated_threads_;
  std::shared_ptr<JobCancellationState> cancellation_;
};

class JobScheduler;

class JobHandle {
 public:
  JobHandle() = default;

  uint64_t job_id() const;
  std::shared_future<JobResult> result() const;
  JobStatus status() const;
  bool Cancel();

 private:
  friend class JobScheduler;

  JobHandle(uint64_t job_id, std::shared_future<JobResult> result,
            std::function<JobStatus()> status, std::function<bool()> cancel);

  uint64_t job_id_ = 0;
  std::shared_future<JobResult> result_;
  std::function<JobStatus()> status_;
  std::function<bool()> cancel_;
};

class JobScheduler {
 public:
  using JobFunction = std::function<JobResult(JobContext&)>;
  using StatusCallback = std::function<void(const JobStatus&)>;

  explicit JobScheduler(SchedulerOptions options);
  ~JobScheduler();

  JobScheduler(const JobScheduler&) = delete;
  JobScheduler& operator=(const JobScheduler&) = delete;

  JobHandle Submit(JobSpec spec, JobFunction job, StatusCallback on_status = {});
  SchedulerStats Stats() const;
  void Shutdown();

 private:
  friend class JobHandle;
  struct State;
  struct JobRecord;

  static bool IsTerminal(JobState state);
  static uint64_t NowMs();
  static JobStatus StatusForState(const std::shared_ptr<State>& state,
                                  const std::shared_ptr<JobRecord>& record);
  static bool CancelRecord(const std::shared_ptr<State>& state,
                           const std::shared_ptr<JobRecord>& record);
  static void Dispatch(const std::shared_ptr<State>& state);
  static void Run(const std::shared_ptr<State>& state,
                  const std::shared_ptr<JobRecord>& record);
  static void EmitStatus(const std::shared_ptr<JobRecord>& record,
                         const JobStatus& status);
  static void ClearStatusCallback(const std::shared_ptr<JobRecord>& record);

  std::shared_ptr<State> state_;
};

const char* JobStateName(JobState state);

}  // namespace ortools_wasm::server

#endif  // ORTOOLS_WASM_SERVER_JOB_SCHEDULER_H_
