#include "server/src/job_scheduler.h"

#include <algorithm>
#include <chrono>
#include <exception>
#include <future>
#include <stdexcept>
#include <utility>
#include <vector>

namespace ortools_wasm::server {
namespace {

int RequirePositiveOption(const char* name, int value) {
  if (value <= 0) {
    throw std::invalid_argument(std::string("SchedulerOptions::") + name +
                                " must be a positive integer.");
  }
  return value;
}

int AllocateThreads(int requested_threads, int total_threads) {
  if (requested_threads <= 0) {
    throw std::invalid_argument("JobSpec::requested_threads must be a positive integer.");
  }
  if (requested_threads > total_threads) {
    throw std::invalid_argument("Job requests more threads than the scheduler capacity.");
  }
  return requested_threads;
}

}  // namespace

class JobCancellationState {
 public:
  bool requested() const {
    return requested_.load(std::memory_order_relaxed);
  }

  uint64_t Register(std::function<void()> handler) {
    if (!handler) {
      throw std::invalid_argument("Cancellation handler must be callable.");
    }
    std::lock_guard lock(mutex_);
    if (handler_) {
      throw std::logic_error("A cancellation handler is already registered.");
    }
    if (requested()) {
      handler();
      return 0;
    }
    handler_id_ = next_handler_id_++;
    handler_ = std::move(handler);
    return handler_id_;
  }

  void Unregister(uint64_t handler_id) {
    if (handler_id == 0) return;
    std::lock_guard lock(mutex_);
    if (handler_id_ != handler_id) return;
    handler_ = {};
    handler_id_ = 0;
  }

  void Request() {
    if (requested_.exchange(true, std::memory_order_relaxed)) return;
    std::lock_guard lock(mutex_);
    if (handler_) handler_();
  }

 private:
  std::atomic_bool requested_{false};
  std::mutex mutex_;
  uint64_t next_handler_id_ = 1;
  uint64_t handler_id_ = 0;
  std::function<void()> handler_;
};

struct JobScheduler::JobRecord {
  uint64_t id = 0;
  JobSpec spec;
  int allocated_threads = 1;
  uint64_t created_at_ms = 0;
  uint64_t started_at_ms = 0;
  uint64_t completed_at_ms = 0;
  JobState state = JobState::kQueued;
  std::string message;
  std::shared_ptr<JobCancellationState> cancellation =
      std::make_shared<JobCancellationState>();
  std::promise<JobResult> promise;
  std::shared_future<JobResult> future;
  JobFunction job;
  StatusCallback on_status;
};

struct JobScheduler::State {
  explicit State(SchedulerOptions options)
      : total_threads(RequirePositiveOption("total_threads", options.total_threads)),
        available_threads(total_threads),
        max_queue_size(RequirePositiveOption("max_queue_size", options.max_queue_size)) {}

  mutable std::mutex mutex;
  uint64_t next_job_id = 1;
  int total_threads = 0;
  int available_threads = 0;
  int max_queue_size = 0;
  bool shutting_down = false;
  std::deque<std::shared_ptr<JobRecord>> queue;
  std::unordered_map<uint64_t, std::shared_ptr<JobRecord>> jobs;
  std::vector<std::future<void>> workers;
};

JobResult JobResult::Succeeded(std::string message) {
  return {JobState::kSucceeded, std::move(message)};
}

JobResult JobResult::Cancelled(std::string message) {
  return {JobState::kCancelled, std::move(message)};
}

JobResult JobResult::Failed(std::string message) {
  return {JobState::kFailed, std::move(message)};
}

CancellationRegistration::CancellationRegistration(
    std::shared_ptr<JobCancellationState> state, uint64_t handler_id)
    : state_(std::move(state)), handler_id_(handler_id) {}

CancellationRegistration::~CancellationRegistration() { Reset(); }

CancellationRegistration::CancellationRegistration(
    CancellationRegistration&& other) noexcept
    : state_(std::move(other.state_)), handler_id_(std::exchange(other.handler_id_, 0)) {}

CancellationRegistration& CancellationRegistration::operator=(
    CancellationRegistration&& other) noexcept {
  if (this == &other) return *this;
  Reset();
  state_ = std::move(other.state_);
  handler_id_ = std::exchange(other.handler_id_, 0);
  return *this;
}

void CancellationRegistration::Reset() {
  if (state_) state_->Unregister(handler_id_);
  state_.reset();
  handler_id_ = 0;
}

JobContext::JobContext(uint64_t job_id, std::string solver, int requested_threads,
                       int allocated_threads,
                       std::shared_ptr<JobCancellationState> cancellation)
    : job_id_(job_id),
      solver_(std::move(solver)),
      requested_threads_(requested_threads),
      allocated_threads_(allocated_threads),
      cancellation_(std::move(cancellation)) {}

bool JobContext::cancellation_requested() const {
  return cancellation_->requested();
}

CancellationRegistration JobContext::OnCancellation(
    std::function<void()> handler) const {
  return CancellationRegistration(cancellation_,
                                  cancellation_->Register(std::move(handler)));
}

JobHandle::JobHandle(uint64_t job_id, std::shared_future<JobResult> result,
                     std::function<JobStatus()> status, std::function<bool()> cancel)
    : job_id_(job_id),
      result_(std::move(result)),
      status_(std::move(status)),
      cancel_(std::move(cancel)) {}

uint64_t JobHandle::job_id() const { return job_id_; }

std::shared_future<JobResult> JobHandle::result() const { return result_; }

JobStatus JobHandle::status() const {
  return status_ ? status_() : JobStatus{};
}

bool JobHandle::Cancel() {
  return cancel_ ? cancel_() : false;
}

JobScheduler::JobScheduler(SchedulerOptions options)
    : state_(std::make_shared<State>(options)) {}

JobScheduler::~JobScheduler() { Shutdown(); }

JobHandle JobScheduler::Submit(JobSpec spec, JobFunction job, StatusCallback on_status) {
  if (!job) {
    throw std::invalid_argument("JobScheduler::Submit requires a job function.");
  }

  auto record = std::make_shared<JobRecord>();
  record->spec = std::move(spec);
  if (record->spec.solver.empty()) record->spec.solver = "unknown";
  record->created_at_ms = NowMs();
  record->allocated_threads = AllocateThreads(record->spec.requested_threads, state_->total_threads);
  record->job = std::move(job);
  record->on_status = std::move(on_status);
  record->future = record->promise.get_future().share();

  {
    std::lock_guard lock(state_->mutex);
    if (state_->shutting_down) throw std::runtime_error("JobScheduler is shutting down.");
    if (static_cast<int>(state_->queue.size()) >= state_->max_queue_size) {
      throw JobQueueFullError("JobScheduler queue is full.");
    }
    record->id = state_->next_job_id++;
    state_->jobs.emplace(record->id, record);
    state_->queue.push_back(record);
  }

  EmitStatus(record, StatusForState(state_, record));
  Dispatch(state_);

  auto state = state_;
  return JobHandle(
      record->id, record->future,
      [state, record] { return JobScheduler::StatusForState(state, record); },
      [state, record] { return JobScheduler::CancelRecord(state, record); });
}

bool JobScheduler::Cancel(uint64_t job_id) {
  std::shared_ptr<JobRecord> record;
  {
    std::lock_guard lock(state_->mutex);
    const auto it = state_->jobs.find(job_id);
    if (it == state_->jobs.end()) return false;
    record = it->second;
  }
  return CancelRecord(state_, record);
}

SchedulerStats JobScheduler::Stats() const {
  std::lock_guard lock(state_->mutex);
  return SchedulerStats{
      state_->total_threads,
      state_->available_threads,
      static_cast<int>(state_->jobs.size() - state_->queue.size()),
      static_cast<int>(state_->queue.size()),
  };
}

void JobScheduler::Shutdown() {
  std::vector<std::shared_ptr<JobRecord>> queued;
  std::vector<std::future<void>> workers;
  {
    std::lock_guard lock(state_->mutex);
    if (state_->shutting_down) return;
    state_->shutting_down = true;
    queued.assign(state_->queue.begin(), state_->queue.end());
    state_->queue.clear();
    for (const auto& record : queued) {
      record->state = JobState::kCancelled;
      record->completed_at_ms = NowMs();
      record->message = "Server scheduler is shutting down.";
      record->promise.set_value(JobResult::Cancelled(record->message));
      state_->jobs.erase(record->id);
    }
    workers = std::move(state_->workers);
  }

  for (const auto& record : queued) {
    record->cancellation->Request();
    EmitStatus(record, StatusForState(state_, record));
  }
  for (auto& worker : workers) {
    if (worker.valid()) worker.wait();
  }
}

bool JobScheduler::IsTerminal(JobState state) {
  return state == JobState::kCancelled || state == JobState::kSucceeded ||
         state == JobState::kFailed;
}

uint64_t JobScheduler::NowMs() {
  using namespace std::chrono;
  return static_cast<uint64_t>(
      duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count());
}

JobStatus JobScheduler::StatusForState(const std::shared_ptr<State>& state,
                                       const std::shared_ptr<JobRecord>& record) {
  std::lock_guard lock(state->mutex);

  int queue_position = 0;
  if (record->state == JobState::kQueued) {
    const auto it = std::find(state->queue.begin(), state->queue.end(), record);
    if (it != state->queue.end()) {
      queue_position = static_cast<int>(std::distance(state->queue.begin(), it)) + 1;
    }
  }

  return JobStatus{
      record->id,
      record->spec.solver,
      record->state,
      record->created_at_ms,
      record->started_at_ms,
      record->completed_at_ms,
      record->spec.requested_threads,
      record->allocated_threads,
      queue_position,
      record->message,
  };
}

bool JobScheduler::CancelRecord(const std::shared_ptr<State>& state,
                                const std::shared_ptr<JobRecord>& record) {
  // Solver interruption can call arbitrary implementation code. Signal it
  // before taking the scheduler mutex so solver and scheduler locks never nest.
  record->cancellation->Request();
  bool dispatch_after_cancel = false;
  {
    std::lock_guard lock(state->mutex);
    if (IsTerminal(record->state)) return false;

    if (record->state == JobState::kQueued) {
      const auto it = std::find(state->queue.begin(), state->queue.end(), record);
      if (it != state->queue.end()) state->queue.erase(it);
      record->state = JobState::kCancelled;
      record->completed_at_ms = NowMs();
      record->message = "Job cancelled before it started.";
      record->promise.set_value(JobResult::Cancelled(record->message));
      state->jobs.erase(record->id);
      dispatch_after_cancel = true;
    } else {
      record->state = JobState::kCancelling;
      record->message = "Cancellation requested.";
    }
  }

  EmitStatus(record, StatusForState(state, record));
  if (dispatch_after_cancel) Dispatch(state);
  return true;
}

void JobScheduler::Dispatch(const std::shared_ptr<State>& state) {
  std::vector<std::shared_ptr<JobRecord>> ready;
  {
    std::lock_guard lock(state->mutex);
    while (!state->shutting_down && !state->queue.empty()) {
      const auto& record = state->queue.front();
      if (record->allocated_threads > state->available_threads) break;
      state->available_threads -= record->allocated_threads;
      record->state = JobState::kStarting;
      record->started_at_ms = NowMs();
      ready.push_back(record);
      state->queue.pop_front();
    }
  }

  for (const auto& record : ready) {
    EmitStatus(record, StatusForState(state, record));
    std::lock_guard lock(state->mutex);
    state->workers.push_back(std::async(std::launch::async, [state, record] {
      JobScheduler::Run(state, record);
    }));
  }
}

void JobScheduler::Run(const std::shared_ptr<State>& state,
                       const std::shared_ptr<JobRecord>& record) {
  {
    std::lock_guard lock(state->mutex);
    if (record->state != JobState::kCancelling) record->state = JobState::kRunning;
  }
  EmitStatus(record, StatusForState(state, record));

  JobResult result;
  try {
    JobContext context(record->id, record->spec.solver, record->spec.requested_threads,
                       record->allocated_threads, record->cancellation);
    result = record->job(context);
    if (record->cancellation->requested() &&
        result.state == JobState::kSucceeded) {
      result = JobResult::Cancelled("Job cancelled.");
    }
  } catch (const std::exception& error) {
    result = JobResult::Failed(error.what());
  } catch (...) {
    result = JobResult::Failed("Job failed with an unknown exception.");
  }

  {
    std::lock_guard lock(state->mutex);
    record->state = result.state;
    record->message = result.message;
    record->completed_at_ms = NowMs();
    state->available_threads += record->allocated_threads;
    state->jobs.erase(record->id);
  }

  record->promise.set_value(result);
  EmitStatus(record, StatusForState(state, record));
  Dispatch(state);
}

void JobScheduler::EmitStatus(const std::shared_ptr<JobRecord>& record,
                              const JobStatus& status) {
  if (record->on_status) record->on_status(status);
}

const char* JobStateName(JobState state) {
  switch (state) {
    case JobState::kQueued:
      return "queued";
    case JobState::kStarting:
      return "starting";
    case JobState::kRunning:
      return "running";
    case JobState::kCancelling:
      return "cancelling";
    case JobState::kCancelled:
      return "cancelled";
    case JobState::kSucceeded:
      return "succeeded";
    case JobState::kFailed:
      return "failed";
  }
  return "unknown";
}

}  // namespace ortools_wasm::server
