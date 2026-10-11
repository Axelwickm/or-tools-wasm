# FetchContent reruns PATCH_COMMAND when its definition changes. Splitting the
# SCIP patches must also work with a cache containing the former combined patch.
foreach(patch scip-v10.0.0.patch scip-v10.0.0-iis-access.patch scip-v10.0.0-iis-integrality.patch)
  set(patch_file "${PATCH_DIRECTORY}/${patch}")
  execute_process(COMMAND git apply --ignore-whitespace --reverse --check "${patch_file}"
    RESULT_VARIABLE already_applied OUTPUT_QUIET ERROR_QUIET)
  if(NOT already_applied EQUAL 0)
    execute_process(COMMAND git apply --ignore-whitespace "${patch_file}"
      RESULT_VARIABLE applied)
    if(NOT applied EQUAL 0)
      message(FATAL_ERROR "Cannot apply SCIP patch: ${patch_file}")
    endif()
  endif()
endforeach()
