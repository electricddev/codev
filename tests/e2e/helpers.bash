#!/usr/bin/env bash
# E2E test helpers for @cluesmith/codev package testing
#
# These helpers provide functions for testing the npm package
# after installation, verifying CLI commands work as expected.
#
# USAGE:
#   # Build and create tarball first
#   cd packages/codev
#   npm run build
#   npm pack
#
#   # Run all E2E tests
#   E2E_TARBALL=$(pwd)/cluesmith-codev-*.tgz bats ../../tests/e2e/
#
#   # Run single test file
#   E2E_TARBALL=$(pwd)/cluesmith-codev-*.tgz bats ../../tests/e2e/init.bats
#
#   # Debug with custom tarball (e.g., from npm registry)
#   npm pack @cluesmith/codev@1.0.0
#   E2E_TARBALL=$(pwd)/cluesmith-codev-1.0.0.tgz bats ../../tests/e2e/

# Setup XDG-sandboxed test environment
# This prevents tests from polluting the user's home directory
# Call this from setup() in each test file
setup_e2e_env() {
  # Create isolated test directory
  TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/codev-e2e.XXXXXX")"
  export TEST_DIR

  # XDG sandboxing - prevent touching real user config
  export XDG_CONFIG_HOME="$TEST_DIR/.xdg/config"
  export XDG_DATA_HOME="$TEST_DIR/.xdg/data"
  export XDG_CACHE_HOME="$TEST_DIR/.xdg/cache"
  export HOME="$TEST_DIR/home"
  mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

  # npm isolation - use local prefix and cache
  export npm_config_prefix="$TEST_DIR/.npm-global"
  export npm_config_cache="$TEST_DIR/.npm-cache"
  mkdir -p "$npm_config_prefix" "$npm_config_cache"

  # Add local npm bin to PATH for globally installed commands
  export PATH="$npm_config_prefix/bin:$PATH"

  return 0
}

# Cleanup test environment
# Call this from teardown() in each test file
teardown_e2e_env() {
  if [[ -n "${TEST_DIR:-}" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
}

# Install codev from the E2E_TARBALL
# Creates a new npm project and installs the package
# Usage: install_codev [project_dir]
# If project_dir not provided, uses current directory
install_codev() {
  local project_dir="${1:-.}"

  # Verify tarball is set
  if [[ -z "${E2E_TARBALL:-}" ]]; then
    echo "Error: E2E_TARBALL environment variable not set" >&2
    return 1
  fi

  # Resolve tarball path (handle glob patterns)
  local tarball
  tarball=$(echo $E2E_TARBALL)  # Expand glob
  if [[ ! -f "$tarball" ]]; then
    echo "Error: Tarball not found: $E2E_TARBALL" >&2
    return 1
  fi

  # Create project directory if needed
  mkdir -p "$project_dir"
  cd "$project_dir" || return 1

  # Initialize npm project
  npm init -y > /dev/null 2>&1

  # Install from tarball
  npm install "$tarball" > /dev/null 2>&1
  local result=$?

  return $result
}

# Run the codev CLI from node_modules
# Usage: run_codev [args...]
run_codev() {
  ./node_modules/.bin/codev "$@"
}

# Run the af CLI from node_modules
# Usage: run_af [args...]
run_af() {
  ./node_modules/.bin/af "$@"
}

# Run the consult CLI from node_modules
# Usage: run_consult [args...]
run_consult() {
  ./node_modules/.bin/consult "$@"
}

# Check if a directory exists
# Usage: assert_dir_exists <path>
assert_dir_exists() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    echo "Expected directory to exist: $path" >&2
    return 1
  fi
  return 0
}

# Check if a file exists
# Usage: assert_file_exists <path>
assert_file_exists() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Expected file to exist: $path" >&2
    return 1
  fi
  return 0
}

# Check if output contains a substring
# Usage: assert_output_contains <substring>
# Must be called after 'run' command
assert_output_contains() {
  local substring="$1"
  if [[ ! "$output" == *"$substring"* ]]; then
    echo "Expected output to contain: $substring" >&2
    echo "Actual output: $output" >&2
    return 1
  fi
  return 0
}

# Check if output does NOT contain a substring
# Usage: refute_output_contains <substring>
# Must be called after 'run' command
refute_output_contains() {
  local substring="$1"
  if [[ "$output" == *"$substring"* ]]; then
    echo "Expected output NOT to contain: $substring" >&2
    echo "Actual output: $output" >&2
    return 1
  fi
  return 0
}
