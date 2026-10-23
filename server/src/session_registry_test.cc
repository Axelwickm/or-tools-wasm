#include "javascript/session_registry.h"
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>

using namespace std::chrono_literals;
void Expect(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}
int main() {
  try {
    ortools_wasm::SessionRegistry<int> registry({1, 50ms});
    auto resource = std::make_shared<int>(42);
    std::weak_ptr<int> observed = resource;
    const auto handle = registry.Insert(std::move(resource));
    bool full = false;
    try { registry.Insert(std::make_shared<int>(7)); } catch (const std::runtime_error&) { full = true; }
    Expect(full, "session capacity enforced");
    auto active = registry.Find(handle);
    std::this_thread::sleep_for(80ms);
    registry.ExpireIdle();
    Expect(registry.Find(handle) != nullptr, "active session survives idle expiry");
    auto active_copy = active;
    active.reset();
    std::this_thread::sleep_for(80ms);
    registry.ExpireIdle();
    Expect(!observed.expired(), "copies retain the active lease");
    active_copy.reset();
    registry.ExpireIdle();
    Expect(registry.Find(handle) != nullptr, "idle clock starts on final lease release");
    std::this_thread::sleep_for(80ms);
    registry.ExpireIdle();
    Expect(observed.expired(), "idle session is freed without another client request");
    Expect(!registry.Find(handle), "expired handles fail");
    const auto replacement = registry.Insert(std::make_shared<int>(9));
    Expect(replacement != handle, "stale handles do not alias replacement");
    auto leased = registry.Find(replacement);
    registry.Erase(replacement);
    Expect(!registry.Find(replacement) && *leased == 9, "explicit deletion preserves in-flight ownership");
    ortools_wasm::SessionRegistry<int> local;
    const auto local_handle = local.Insert(std::make_shared<int>(1));
    local.ExpireIdle();
    Expect(local.Find(local_handle) != nullptr, "local registries preserve explicit lifetimes");
    std::cout << "[PASS] Session capacity, idle expiry, active leases and deletion\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "[FAIL] " << error.what() << '\n';
    return 1;
  }
}
