#!/usr/bin/env bats
# TC-006: consult Command Tests
#
# Tests that verify the consult CLI works correctly.
# Note: These tests only verify help output and CLI structure,
# not actual AI consultations (which require credentials).

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

@test "consult --help shows available commands" {
  run ./node_modules/.bin/consult --help
  assert_success
  assert_output --partial "pr"
  assert_output --partial "spec"
  assert_output --partial "plan"
  assert_output --partial "general"
}

@test "consult shows model options" {
  run ./node_modules/.bin/consult --help
  assert_success
  assert_output --partial "model"
}

# === Subcommand Help ===

@test "consult pr --help shows PR review options" {
  run ./node_modules/.bin/consult pr --help
  assert_success
}

@test "consult spec --help shows spec review options" {
  run ./node_modules/.bin/consult spec --help
  assert_success
}

@test "consult plan --help shows plan review options" {
  run ./node_modules/.bin/consult plan --help
  assert_success
}

@test "consult general --help shows general query options" {
  run ./node_modules/.bin/consult general --help
  assert_success
}

# === Error Handling ===

@test "consult without subcommand shows help" {
  run ./node_modules/.bin/consult
  # Should show help or error but not crash
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

@test "consult with unknown subcommand fails gracefully" {
  run ./node_modules/.bin/consult unknown-subcommand
  assert_failure
}

@test "consult pr without number shows error" {
  run ./node_modules/.bin/consult pr
  # Should fail with helpful message
  assert_failure
}

@test "consult spec without number shows error" {
  run ./node_modules/.bin/consult spec
  # Should fail with helpful message
  assert_failure
}

# === Model Validation ===

@test "consult accepts --model gemini option" {
  run ./node_modules/.bin/consult --model gemini --help
  assert_success
}

@test "consult accepts --model codex option" {
  run ./node_modules/.bin/consult --model codex --help
  assert_success
}

@test "consult accepts --model claude option" {
  run ./node_modules/.bin/consult --model claude --help
  assert_success
}

# === Dry Run Mode ===

@test "consult supports --dry-run flag" {
  run ./node_modules/.bin/consult --help
  # Dry run should be documented in help
  assert_output --partial "dry"
}
