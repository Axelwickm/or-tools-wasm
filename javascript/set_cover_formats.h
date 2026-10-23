#ifndef ORTOOLS_WASM_SET_COVER_FORMATS_H_
#define ORTOOLS_WASM_SET_COVER_FORMATS_H_
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <unistd.h>
#include "ortools/base/file.h"
#include "ortools/base/options.h"
#include "ortools/set_cover/set_cover_reader.h"
#include "google/protobuf/util/json_util.h"
namespace ortools_wasm {
class SetCoverTemporaryFile {
 public:
  SetCoverTemporaryFile() {
    char pattern[] = "/tmp/ortools-cover-XXXXXX";
    const int fd = mkstemp(pattern);
    if (fd < 0) throw std::runtime_error("Unable to create native Set Cover temporary file.");
    close(fd); name_ = pattern;
  }
  ~SetCoverTemporaryFile() { std::remove(name_.c_str()); }
  SetCoverTemporaryFile(const SetCoverTemporaryFile&) = delete;
  SetCoverTemporaryFile& operator=(const SetCoverTemporaryFile&) = delete;
  const std::string& name() const { return name_; }
 private:
  std::string name_;
};
inline operations_research::SetCoverModel ReadSetCoverText(const std::string& text, int format) {
  if (format < 0 || format > 2) throw std::invalid_argument("Unknown Set Cover input format.");
  SetCoverTemporaryFile temporary;
  const auto written = file::SetContents(temporary.name(), text, file::Defaults());
  if (!written.ok()) throw std::runtime_error(written.ToString());
  if (format == 2) return operations_research::ReadFimiDat(temporary.name());
  auto model = format == 0 ? operations_research::ReadOrlibScp(temporary.name())
                           : operations_research::ReadOrlibRail(temporary.name());
  // The native readers infer the universe from incidence entries. Neither the
  // model nor SetCoverModelProto can preserve trailing rows with no incidence.
  // The reader has already validated this integer; avoid copying the input.
  const auto declared_elements = std::strtoll(text.c_str(), nullptr, 10);
  if (declared_elements != model.num_elements()) {
    throw std::invalid_argument("OR-Library input has trailing uncovered elements that the native Set Cover model cannot preserve.");
  }
  return model;
}
inline std::string WriteSetCoverText(const operations_research::SetCoverModel& model, int format) {
  if (format < 0 || format > 1) throw std::invalid_argument("Native Set Cover has no writer for this format.");
  SetCoverTemporaryFile temporary;
  if (format == 0) operations_research::WriteOrlibScp(model, temporary.name());
  else operations_research::WriteOrlibRail(model, temporary.name());
  auto text = file::GetContents(temporary.name(), file::Defaults());
  if (!text.ok()) throw std::runtime_error(text.status().ToString());
  return *text;
}
inline std::string SetCoverModelJson(const operations_research::SetCoverModel& model) {
  std::string json;
  const auto result = google::protobuf::util::MessageToJsonString(model.ExportModelAsProto(), &json);
  if (!result.ok()) throw std::runtime_error(result.ToString());
  return json;
}
}  // namespace ortools_wasm
#endif
