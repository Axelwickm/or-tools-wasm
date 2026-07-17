#include "server/src/job_scheduler.h"

#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <exception>
#include <functional>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace ortools_wasm::server {
namespace {

using namespace std::chrono_literals;

class ManualEvent {
 public:
  void Set() {
    {
      std::lock_guard lock(mutex_);
      set_ = true;
    }
    cv_.notify_all();
  }

  void Wait() {
    std::unique_lock lock(mutex_);
    cv_.wait(lock, [this] { return set_; });
  }

  bool WaitFor(std::chrono::milliseconds timeout) {
    std::unique_lock lock(mutex_);
    return cv_.wait_for(lock, timeout, [this] { return set_; });
  }

 private:
  std::mutex mutex_;
  std::condition_variable cv_;
  bool set_ = false;
};

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

JobSpec Spec(std::string solver = "cp-sat", int requested_threads = 1) {
  JobSpec spec;
  spec.solver = std::move(solver);
  spec.requested_threads = requested_threads;
  return spec;
}

std::vector<JobState> States(const std::vector<JobStatus>& statuses) {
  std::vector<JobState> states;
  states.reserve(statuses.size());
  for (const auto& status : statuses) states.push_back(status.state);
  return states;
}

bool ContainsState(const std::vector<JobStatus>& statuses, JobState state) {
  for (const auto& status : statuses) {
    if (status.state == state) return true;
  }
  return false;
}

void RunsSingleJobAndReportsLifecycle() {
  JobScheduler scheduler({1, 8});
  std::vector<JobStatus> statuses;
  std::mutex statuses_mutex;

  auto handle = scheduler.Submit(
      Spec(), [](JobContext& context) {
        ExpectEq(context.solver(), std::string("cp-sat"), "job context solver");
        ExpectEq(context.requested_threads(), 1, "job context requested threads");
        ExpectEq(context.allocated_threads(), 1, "job context allocated threads");
        return JobResult::Succeeded("done");
      },
      [&](const JobStatus& status) {
        std::lock_guard lock(statuses_mutex);
        statuses.push_back(status);
      });

  const JobResult result = handle.result().get();
  ExpectEq(result.state, JobState::kSucceeded, "single job result state");
  ExpectEq(handle.status().state, JobState::kSucceeded, "single job final handle status");

  std::lock_guard lock(statuses_mutex);
  Expect(ContainsState(statuses, JobState::kQueued), "single job reports queued");
  Expect(ContainsState(statuses, JobState::kStarting), "single job reports starting");
  Expect(ContainsState(statuses, JobState::kRunning), "single job reports running");
  Expect(ContainsState(statuses, JobState::kSucceeded), "single job reports succeeded");
}

void QueuesWhenThreadBudgetIsExhausted() {
  JobScheduler scheduler({1, 8});
  ManualEvent first_started;
  ManualEvent release_first;
  ManualEvent second_started;

  auto first = scheduler.Submit(Spec(), [&](JobContext&) {
    first_started.Set();
    release_first.Wait();
    return JobResult::Succeeded("first");
  });
  first_started.Wait();

  auto second = scheduler.Submit(Spec(), [&](JobContext&) {
    second_started.Set();
    return JobResult::Succeeded("second");
  });

  ExpectEq(second.status().state, JobState::kQueued, "second job waits in queue");
  ExpectEq(second.status().queue_position, 1, "second job queue position");
  Expect(!second_started.WaitFor(30ms), "second job does not start before first releases");

  release_first.Set();
  Expect(second_started.WaitFor(2s), "second job starts after first releases");
  ExpectEq(first.result().get().state, JobState::kSucceeded, "first result");
  ExpectEq(second.result().get().state, JobState::kSucceeded, "second result");
}

void RunsJobsConcurrentlyWhenTokensAreAvailable() {
  JobScheduler scheduler({2, 8});
  ManualEvent first_started;
  ManualEvent second_started;
  ManualEvent release;

  auto blocking_job = [&](ManualEvent& started) {
    return [&](JobContext&) {
      started.Set();
      release.Wait();
      return JobResult::Succeeded();
    };
  };

  auto first = scheduler.Submit(Spec(), blocking_job(first_started));
  auto second = scheduler.Submit(Spec(), blocking_job(second_started));

  Expect(first_started.WaitFor(2s), "first parallel job starts");
  Expect(second_started.WaitFor(2s), "second parallel job starts");
  ExpectEq(scheduler.Stats().active_jobs, 2, "two active jobs");
  release.Set();
  ExpectEq(first.result().get().state, JobState::kSucceeded, "first parallel result");
  ExpectEq(second.result().get().state, JobState::kSucceeded, "second parallel result");
}

void LargerJobWaitsForEnoughTokens() {
  JobScheduler scheduler({2, 8});
  ManualEvent small_started;
  ManualEvent release_small;
  ManualEvent large_started;

  auto small = scheduler.Submit(Spec("cp-sat", 1), [&](JobContext&) {
    small_started.Set();
    release_small.Wait();
    return JobResult::Succeeded("small");
  });
  small_started.Wait();

  auto large = scheduler.Submit(Spec("cp-sat", 2), [&](JobContext& context) {
    ExpectEq(context.allocated_threads(), 2, "large allocated threads");
    large_started.Set();
    return JobResult::Succeeded("large");
  });

  ExpectEq(large.status().state, JobState::kQueued, "large job queues");
  Expect(!large_started.WaitFor(30ms), "large job waits for both tokens");
  release_small.Set();
  Expect(large_started.WaitFor(2s), "large job starts after enough tokens free");
  ExpectEq(small.result().get().state, JobState::kSucceeded, "small result");
  ExpectEq(large.result().get().state, JobState::kSucceeded, "large result");
}

void CancelsQueuedJob() {
  JobScheduler scheduler({1, 8});
  ManualEvent running_started;
  ManualEvent release_running;

  auto running = scheduler.Submit(Spec(), [&](JobContext&) {
    running_started.Set();
    release_running.Wait();
    return JobResult::Succeeded("running");
  });
  running_started.Wait();

  bool queued_body_ran = false;
  auto queued = scheduler.Submit(Spec(), [&](JobContext&) {
    queued_body_ran = true;
    return JobResult::Succeeded("should not run");
  });

  Expect(queued.Cancel(), "queued cancel accepted");
  ExpectEq(queued.result().get().state, JobState::kCancelled, "queued cancel result");
  ExpectEq(queued.status().state, JobState::kCancelled, "queued cancel status");
  Expect(!queued_body_ran, "queued cancelled job body does not run");

  release_running.Set();
  ExpectEq(running.result().get().state, JobState::kSucceeded, "running result after queued cancel");
}

void RequestsCooperativeCancellationForRunningJob() {
  JobScheduler scheduler({1, 8});
  ManualEvent started;
  ManualEvent observed_cancel;

  auto handle = scheduler.Submit(Spec(), [&](JobContext& context) {
    started.Set();
    while (!context.cancellation_requested()) {
      std::this_thread::sleep_for(1ms);
    }
    observed_cancel.Set();
    return JobResult::Cancelled("observed");
  });

  started.Wait();
  Expect(handle.Cancel(), "running cancel accepted");
  Expect(observed_cancel.WaitFor(2s), "running job observes cancellation");
  ExpectEq(handle.result().get().state, JobState::kCancelled, "running cancel result");
  ExpectEq(handle.status().state, JobState::kCancelled, "running cancel status");
}

void CapturesJobExceptionsAsFailures() {
  JobScheduler scheduler({1, 8});
  auto handle = scheduler.Submit(Spec(), [](JobContext&) -> JobResult {
    throw std::runtime_error("boom");
  });

  const JobResult result = handle.result().get();
  ExpectEq(result.state, JobState::kFailed, "exception result state");
  ExpectEq(result.message, std::string("boom"), "exception message");
  ExpectEq(handle.status().state, JobState::kFailed, "exception final status");
}

void RejectsSubmissionsAfterShutdown() {
  JobScheduler scheduler({1, 8});
  scheduler.Shutdown();

  bool threw = false;
  try {
    scheduler.Submit(Spec(), [](JobContext&) { return JobResult::Succeeded(); });
  } catch (const std::runtime_error&) {
    threw = true;
  }
  Expect(threw, "submit after shutdown throws");
}

void RejectsInvalidSchedulerOptions() {
  bool missing_total_threads_threw = false;
  try {
    JobScheduler scheduler({0, 8});
  } catch (const std::invalid_argument&) {
    missing_total_threads_threw = true;
  }
  Expect(missing_total_threads_threw, "missing total thread budget throws");

  bool missing_max_queue_size_threw = false;
  try {
    JobScheduler scheduler({1, 0});
  } catch (const std::invalid_argument&) {
    missing_max_queue_size_threw = true;
  }
  Expect(missing_max_queue_size_threw, "missing max queue size throws");
}

struct TestCase {
  const char* name;
  void (*run)();
};

int RunAllTests() {
  const TestCase tests[] = {
      {"RunsSingleJobAndReportsLifecycle", RunsSingleJobAndReportsLifecycle},
      {"QueuesWhenThreadBudgetIsExhausted", QueuesWhenThreadBudgetIsExhausted},
      {"RunsJobsConcurrentlyWhenTokensAreAvailable", RunsJobsConcurrentlyWhenTokensAreAvailable},
      {"LargerJobWaitsForEnoughTokens", LargerJobWaitsForEnoughTokens},
      {"CancelsQueuedJob", CancelsQueuedJob},
      {"RequestsCooperativeCancellationForRunningJob", RequestsCooperativeCancellationForRunningJob},
      {"CapturesJobExceptionsAsFailures", CapturesJobExceptionsAsFailures},
      {"RejectsSubmissionsAfterShutdown", RejectsSubmissionsAfterShutdown},
      {"RejectsInvalidSchedulerOptions", RejectsInvalidSchedulerOptions},
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
