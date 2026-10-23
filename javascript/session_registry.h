#ifndef ORTOOLS_WASM_SESSION_REGISTRY_H_
#define ORTOOLS_WASM_SESSION_REGISTRY_H_

#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <unordered_map>
#include "absl/random/random.h"

namespace ortools_wasm {

struct SessionLimits {
  // Zero leaves local WASM registries unlimited. Servers supply finite limits.
  size_t capacity = 0;
  std::chrono::milliseconds idle_timeout{0};
};
inline SessionLimits ServerSessionLimits() {
  return {64, std::chrono::minutes(30)};
}

// Returned pointers lease an entry. Idle time starts when the last operation
// releases its lease; cleanup never removes an in-flight native operation.
template <typename T>
class SessionRegistry {
 public:
  explicit SessionRegistry(SessionLimits limits = {}) : limits_(limits) {}

  uint64_t Insert(std::shared_ptr<T> session) {
    std::lock_guard lock(mutex_);
    ExpireLocked();
    if (limits_.capacity && entries_.size() >= limits_.capacity)
      throw std::runtime_error("Native session capacity reached; close an existing session or wait for idle expiry.");
    uint64_t handle;
    do { handle = absl::Uniform<uint64_t>(random_, 1, uint64_t{1} << 53); } while (entries_.count(handle));
    entries_.emplace(handle, std::make_shared<Entry>(std::move(session)));
    return handle;
  }

  std::shared_ptr<T> Find(uint64_t handle) {
    std::lock_guard lock(mutex_);
    ExpireLocked();
    const auto found = entries_.find(handle);
    if (found == entries_.end()) return nullptr;
    auto lease = std::make_shared<Lease>(found->second);
    return std::shared_ptr<T>(std::move(lease), found->second->session.get());
  }

  void Erase(uint64_t handle) {
    std::lock_guard lock(mutex_);
    entries_.erase(handle);
  }

  void ExpireIdle() {
    std::lock_guard lock(mutex_);
    ExpireLocked();
  }

 private:
  using Clock = std::chrono::steady_clock;
  static int64_t Now() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(Clock::now().time_since_epoch()).count();
  }
  struct Entry {
    explicit Entry(std::shared_ptr<T> value) : session(std::move(value)), last_used(Now()) {}
    std::shared_ptr<T> session;
    std::atomic<int64_t> last_used;
  };
  struct Lease {
    explicit Lease(std::shared_ptr<Entry> value) : entry(std::move(value)) {}
    ~Lease() { entry->last_used.store(Now()); }
    std::shared_ptr<Entry> entry;
  };
  void ExpireLocked() {
    if (limits_.idle_timeout.count() <= 0) return;
    const auto cutoff = Now() - std::chrono::duration_cast<std::chrono::nanoseconds>(limits_.idle_timeout).count();
    for (auto it = entries_.begin(); it != entries_.end();) {
      if (it->second.use_count() == 1 && it->second->last_used.load() <= cutoff) it = entries_.erase(it);
      else ++it;
    }
  }
  const SessionLimits limits_;
  std::mutex mutex_;
  absl::BitGen random_;
  std::unordered_map<uint64_t, std::shared_ptr<Entry>> entries_;
};
}  // namespace ortools_wasm
#endif
