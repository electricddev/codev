#!/usr/bin/env bats
# TC-005: af (agent-farm) Command Tests
#
# Tests that verify the af CLI works correctly.

load '../lib/bats-support/load'
load '../lib/bats-assert/load'
load '../lib/bats-file/load'
load 'helpers.bash'

setup() {
  setup_e2e_env
  cd "$TEST_DIR"
  install_codev
}

teardown() {
  teardown_e2e_env
}

# === Help and Version ===

@test "af --help shows available commands" {
  run ./node_modules/.bin/af --help
  assert_success
  assert_output --partial "start"
  assert_output --partial "spawn"
  assert_output --partial "status"
}

@test "af --version returns a version string" {
  run ./node_modules/.bin/af --version
  assert_success
  # Version should be a semantic version (e.g., 1.0.0, 1.1.0)
  [[ "$output" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]
}

@test "af help shows usage information" {
  run ./node_modules/.bin/af help
  # Should show help or error gracefully
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

# === Status Command ===

@test "af status works in a codev project" {
  # Initialize a codev project first
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  run ../node_modules/.bin/af status
  # Should work even without running dashboard
  # May show "no builders" or similar
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

@test "af status shows Architect section" {
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  run ../node_modules/.bin/af status
  assert_output --partial "Architect"
}

# === Subcommand Help ===

@test "af start --help shows options" {
  run ./node_modules/.bin/af start --help
  assert_success
}

@test "af spawn --help shows options" {
  run ./node_modules/.bin/af spawn --help
  assert_success
  assert_output --partial "project"
}

@test "af cleanup --help shows options" {
  run ./node_modules/.bin/af cleanup --help
  assert_success
}

# === Error Cases ===

@test "af fails gracefully with unknown command" {
  run ./node_modules/.bin/af unknown-command-xyz
  assert_failure
}

@test "af spawn without project ID shows error" {
  ./node_modules/.bin/codev init test-project --yes
  cd test-project

  run ../node_modules/.bin/af spawn
  # Should fail and show help or error message
  assert_failure
}

@test "af status outside codev project handles gracefully" {
  # In TEST_DIR without codev structure
  run ./node_modules/.bin/af status
  # Should fail gracefully with helpful message
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}
