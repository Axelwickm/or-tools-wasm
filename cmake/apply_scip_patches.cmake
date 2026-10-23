# Apply the platform compatibility patch idempotently for cached builds.
foreach(patch scip-v10.0.0.patch)
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
