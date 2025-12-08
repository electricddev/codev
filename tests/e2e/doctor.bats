#!/usr/bin/env bats
# TC-004: codev doctor Tests
#
# Tests that verify the codev doctor command checks
# dependencies correctly.

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

# === Happy Path Tests ===

@test "codev doctor runs without crashing" {
  run ./node_modules/.bin/codev doctor
  # Doctor may exit non-zero if optional deps missing, but shouldn't crash
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

@test "codev doctor checks Node.js" {
  run ./node_modules/.bin/codev doctor
  # Output should mention Node.js check
  assert_output --partial "Node"
}

@test "codev doctor checks git" {
  run ./node_modules/.bin/codev doctor
  # Output should mention git check
  assert_output --partial "git"
}

@test "codev doctor shows check results" {
  run ./node_modules/.bin/codev doctor
  # Should show pass/fail indicators (check marks or x marks)
  # Or status text like "found", "missing", "ok", etc.
  [[ "$output" =~ (found|missing|ok|✓|✗|pass|fail|error) ]] || \
  [[ "$output" =~ (Node|git|npm) ]]
}

# === Dependency Checks ===

@test "codev doctor checks for tmux (optional)" {
  run ./node_modules/.bin/codev doctor
  # tmux is optional, so just verify it's checked
  # (may show as missing or present depending on environment)
  assert_output --partial "tmux"
}

@test "codev doctor checks for ttyd (optional)" {
  run ./node_modules/.bin/codev doctor
  # ttyd is optional for agent-farm
  assert_output --partial "ttyd"
}

# === Edge Cases ===

@test "codev doctor handles missing optional deps gracefully" {
  # Create a restricted PATH that doesn't include tmux/ttyd
  local restricted_path="/usr/bin:/bin"

  PATH="$restricted_path:$(dirname $(which node))" \
    run ./node_modules/.bin/codev doctor

  # Should still complete (exit 0 or 1), just report missing
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

@test "codev doctor output is readable" {
  run ./node_modules/.bin/codev doctor

  # Output should have multiple lines (not empty)
  [[ "${#lines[@]}" -gt 1 ]]
}
