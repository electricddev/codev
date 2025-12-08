#!/usr/bin/env bash
# E2E Test Suite Setup
#
# This file runs once before any tests in the e2e/ directory.
# It validates the test environment and sets up shared resources.

# Verify E2E_TARBALL environment variable is set
setup_suite() {
  if [[ -z "${E2E_TARBALL:-}" ]]; then
    echo "ERROR: E2E_TARBALL environment variable must be set" >&2
    echo "" >&2
    echo "Usage:" >&2
    echo "  cd packages/codev && npm pack" >&2
    echo "  E2E_TARBALL=\$(pwd)/cluesmith-codev-*.tgz bats ../../tests/e2e/" >&2
    return 1
  fi

  # Resolve glob pattern if used
  local tarball
  tarball=$(echo $E2E_TARBALL)

  if [[ ! -f "$tarball" ]]; then
    echo "ERROR: Tarball not found: $E2E_TARBALL" >&2
    echo "" >&2
    echo "Make sure to build and pack the package first:" >&2
    echo "  cd packages/codev" >&2
    echo "  npm run build" >&2
    echo "  npm pack" >&2
    return 1
  fi

  # Export resolved tarball path for all tests
  export E2E_TARBALL="$tarball"

  echo "E2E Test Suite initialized"
  echo "  Tarball: $E2E_TARBALL"
}

teardown_suite() {
  # Nothing to clean up at suite level
  :
}
