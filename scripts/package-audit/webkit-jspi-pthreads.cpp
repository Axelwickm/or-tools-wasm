#include <thread>
#include <atomic>
extern "C" int work() {
 std::atomic<int> counter{0};
 std::thread workers[4];
 for(auto& worker:workers)worker=std::thread([&]{counter.fetch_add(1);});
 for(auto& worker:workers)worker.join();
 return counter.load();
}
