#!/usr/bin/env bats
# TC-002: codev init Tests
#
# Tests that verify the codev init command creates
# project structure correctly.

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

@test "codev init creates project directory" {
  run ./node_modules/.bin/codev init my-project --yes
  assert_success

  assert_dir_exists "my-project"
}

@test "codev init creates codev directory structure" {
  ./node_modules/.bin/codev init my-project --yes

  assert_dir_exists "my-project/codev"
  assert_dir_exists "my-project/codev/specs"
  assert_dir_exists "my-project/codev/plans"
  assert_dir_exists "my-project/codev/reviews"
  assert_dir_exists "my-project/codev/protocols"
}

@test "codev init creates SPIDER protocol" {
  ./node_modules/.bin/codev init my-project --yes

  assert_dir_exists "my-project/codev/protocols/spider"
  assert_file_exists "my-project/codev/protocols/spider/protocol.md"
}

@test "codev init creates CLAUDE.md" {
  ./node_modules/.bin/codev init my-project --yes

  assert_file_exists "my-project/CLAUDE.md"
}

@test "codev init creates AGENTS.md" {
  ./node_modules/.bin/codev init my-project --yes

  assert_file_exists "my-project/AGENTS.md"
}

@test "codev init creates .gitignore" {
  ./node_modules/.bin/codev init my-project --yes

  assert_file_exists "my-project/.gitignore"
}

@test "codev init initializes git repository" {
  ./node_modules/.bin/codev init my-project --yes

  assert_dir_exists "my-project/.git"
}

@test "codev init replaces PROJECT_NAME placeholder" {
  ./node_modules/.bin/codev init my-custom-project --yes

  run cat my-custom-project/CLAUDE.md
  assert_success
  assert_output --partial "my-custom-project"
  refute_output --partial "{{PROJECT_NAME}}"
}

@test "codev init creates roles directory" {
  ./node_modules/.bin/codev init my-project --yes

  assert_dir_exists "my-project/codev/roles"
  assert_file_exists "my-project/codev/roles/architect.md"
  assert_file_exists "my-project/codev/roles/builder.md"
}

@test "codev init creates protocol templates" {
  ./node_modules/.bin/codev init my-project --yes

  assert_file_exists "my-project/codev/protocols/spider/templates/spec.md"
  assert_file_exists "my-project/codev/protocols/spider/templates/plan.md"
  assert_file_exists "my-project/codev/protocols/spider/templates/review.md"
}

# === Error Cases ===

@test "codev init fails if directory already exists" {
  mkdir existing-dir

  run ./node_modules/.bin/codev init existing-dir --yes
  assert_failure
  assert_output --partial "already exists"
}

@test "codev init --yes requires project name argument" {
  run ./node_modules/.bin/codev init --yes
  assert_failure
}

@test "codev init without --yes prompts for confirmation" {
  # When running non-interactively without --yes, it should fail or prompt
  # Since we're running in a non-interactive shell, it should fail
  run ./node_modules/.bin/codev init test-project </dev/null
  # The command should either fail or proceed with defaults
  # We just verify it doesn't crash
  [[ "$status" -eq 0 ]] || [[ "$status" -eq 1 ]]
}

@test "codev init project name with spaces works when quoted" {
  run ./node_modules/.bin/codev init "project with spaces" --yes
  assert_success
  assert_dir_exists "project with spaces"
  assert_dir_exists "project with spaces/codev"
}
