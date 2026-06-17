cmake_minimum_required(VERSION 3.16)
project(sim-kernel C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Strict warnings
add_compile_options(-Wall -Wextra -Werror -pedantic)

# Optional AddressSanitizer for debug builds
option(ENABLE_ASAN "Enable AddressSanitizer" OFF)
if(ENABLE_ASAN)
    add_compile_options(-fsanitize=address -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address)
endif()

# ── Shared vendored dependency ─────────────────────────────────────
set(CJSON_SRC ${CMAKE_CURRENT_SOURCE_DIR}/vendor/cJSON/cJSON.c)
set_source_files_properties(${CJSON_SRC} PROPERTIES
    COMPILE_FLAGS "-Wno-unused-parameter -Wno-float-equal -Wno-switch-enum -Wno-padded"
)

# ── Domain directories ─────────────────────────────────────────────
set(BONDGRAPH_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/domains/bondgraph)
set(ODUM_DIR      ${CMAKE_CURRENT_SOURCE_DIR}/src/domains/odum-esl)

# ── Domain: Bond Graph ─────────────────────────────────────────────
# wasm_bridge.c includes gssk.h (for sim_kernel_run odum-esl path),
# so ODUM_DIR must be on the private include path of this library.
add_library(simkernel_bondgraph STATIC
    ${BONDGRAPH_DIR}/bondgraph.c
    ${BONDGRAPH_DIR}/json_io.c
    ${BONDGRAPH_DIR}/wasm_bridge.c
    ${BONDGRAPH_DIR}/bg_solver.c
    ${CJSON_SRC}
)
target_include_directories(simkernel_bondgraph PUBLIC  ${BONDGRAPH_DIR})
target_include_directories(simkernel_bondgraph PRIVATE vendor/cJSON ${ODUM_DIR})
target_link_libraries(simkernel_bondgraph PRIVATE m)

# ── Domain: Odum ESL (GSSK) ────────────────────────────────────────
add_library(simkernel_odum STATIC
    ${ODUM_DIR}/gssk.c
    ${ODUM_DIR}/advanced.c
    ${CJSON_SRC}
)
target_include_directories(simkernel_odum PUBLIC  ${ODUM_DIR})
target_include_directories(simkernel_odum PRIVATE vendor/cJSON)
target_link_libraries(simkernel_odum PRIVATE m)

if(NOT EMSCRIPTEN)
    # ── Odum ESL CLI ───────────────────────────────────────────────
    add_executable(gssk ${ODUM_DIR}/main.c)
    target_link_libraries(gssk PRIVATE simkernel_odum)
    target_include_directories(gssk PRIVATE ${ODUM_DIR})

    # ── Bond Graph test runner ─────────────────────────────────────
    set(BG_TEST_DIR ${CMAKE_CURRENT_SOURCE_DIR}/tests/bondgraph)

    add_executable(bondgraph_tests
        ${BG_TEST_DIR}/test_main.c
        ${BG_TEST_DIR}/test_graph.c
        ${BG_TEST_DIR}/test_scap.c
        ${BG_TEST_DIR}/test_json.c
        ${BG_TEST_DIR}/test_sim.c
    )
    # Bond Graph tests also exercise sim_kernel_run (which calls GSSK),
    # so link both domain libraries.
    target_link_libraries(bondgraph_tests PRIVATE
        simkernel_bondgraph simkernel_odum m)
    target_include_directories(bondgraph_tests PRIVATE
        ${BONDGRAPH_DIR} ${ODUM_DIR} ${BG_TEST_DIR})

    # ── Odum ESL test runner ───────────────────────────────────────
    set(ODUM_TEST_DIR ${CMAKE_CURRENT_SOURCE_DIR}/tests/odum-esl)

    add_executable(odum_tests ${ODUM_TEST_DIR}/test_advanced.c)
    target_link_libraries(odum_tests PRIVATE simkernel_odum m)
    target_include_directories(odum_tests PRIVATE ${ODUM_DIR})

    # ── Kernel integration test runner (both domains via sim_kernel_run) ──
    add_executable(kernel_integration_tests
        ${ODUM_TEST_DIR}/test_kernel_integration.c)
    target_link_libraries(kernel_integration_tests PRIVATE
        simkernel_bondgraph simkernel_odum m)
    target_include_directories(kernel_integration_tests PRIVATE
        ${ODUM_DIR} ${BONDGRAPH_DIR})

    # ── CSV comparison utility ─────────────────────────────────────
    add_executable(csv_compare ${ODUM_TEST_DIR}/csv_compare.c)
    target_link_libraries(csv_compare PRIVATE m)

    # ── CTest integration ──────────────────────────────────────────
    enable_testing()
    add_test(NAME bondgraph_unit_tests COMMAND bondgraph_tests)
    add_test(NAME kernel_integration   COMMAND kernel_integration_tests)

    set(ODUM_MODELS
        atwood_model decay_model economic_model
        oscillator_model saturation_model simple_model supply_chain_30
    )
    foreach(MODEL ${ODUM_MODELS})
        add_test(
            NAME odum_regression_${MODEL}
            COMMAND ${CMAKE_COMMAND} -E env
                $<TARGET_FILE:gssk>
                ${ODUM_TEST_DIR}/examples/${MODEL}.json
                ${CMAKE_CURRENT_BINARY_DIR}/results/${MODEL}.csv
        )
        set_tests_properties(odum_regression_${MODEL} PROPERTIES DEPENDS gssk)
    endforeach()
endif()

# ── Emscripten / WASM target (single binary, both domains) ────────
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    add_executable(sim_kernel
        ${BONDGRAPH_DIR}/bondgraph.c
        ${BONDGRAPH_DIR}/json_io.c
        ${BONDGRAPH_DIR}/wasm_bridge.c
        ${BONDGRAPH_DIR}/bg_solver.c
        ${ODUM_DIR}/gssk.c
        ${ODUM_DIR}/advanced.c
        ${CJSON_SRC}
    )
    target_include_directories(sim_kernel PRIVATE
        ${BONDGRAPH_DIR} ${ODUM_DIR} vendor/cJSON)

    set_source_files_properties(${CJSON_SRC} PROPERTIES
        COMPILE_FLAGS "-Wno-unused-parameter -Wno-float-equal -Wno-switch-enum -Wno-padded"
    )

    target_link_options(sim_kernel PRIVATE
        "SHELL:-s EXPORTED_FUNCTIONS=['_validate_bondgraph','_sim_kernel_run','_cleanup_bridge','_malloc','_free']"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']"
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createSimKernel'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='node'"
    )
endif()
