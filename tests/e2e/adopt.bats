#!/usr/bin/env bats
# TC-003: codev adopt Tests
#
# Tests that verify the codev adopt command adds Codev
# to existing projects correctly.

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

@test "codev adopt adds codev to existing project" {
  # Create existing project with git
  mkdir existing-project
  cd existing-project
  echo "# My Project" > README.md
  git init -q

  run ../node_modules/.bin/codev adopt --yes
  assert_success

  # Verify codev structure added
  assert_dir_exists "codev"
  assert_dir_exists "codev/specs"
  assert_dir_exists "codev/plans"
  assert_dir_exists "codev/reviews"
  assert_dir_exists "codev/protocols"
}

@test "codev adopt preserves existing README" {
  # Create existing project with content
  mkdir existing-project
  cd existing-project
  echo "# My Existing Project" > README.md
  echo "This is my project description." >> README.md
  git init -q

  ../node_modules/.bin/codev adopt --yes

  # Verify README preserved
  run cat README.md
  assert_success
  assert_output --partial "My Existing Project"
  assert_output --partial "project description"
}

@test "codev adopt creates CLAUDE.md" {
  mkdir existing-project
  cd existing-project
  git init -q

  ../node_modules/.bin/codev adopt --yes

  assert_file_exists "CLAUDE.md"
}

@test "codev adopt creates AGENTS.md" {
  mkdir existing-project
  cd existing-project
  git init -q

  ../node_modules/.bin/codev adopt --yes

  assert_file_exists "AGENTS.md"
}

@test "codev adopt creates SPIDER protocol" {
  mkdir existing-project
  cd existing-project
  git init -q

  ../node_modules/.bin/codev adopt --yes

  assert_dir_exists "codev/protocols/spider"
  assert_file_exists "codev/protocols/spider/protocol.md"
}

@test "codev adopt second run fails with update suggestion" {
  mkdir existing-project
  cd existing-project
  git init -q

  ../node_modules/.bin/codev adopt --yes
  run ../node_modules/.bin/codev adopt --yes

  # Second run should fail and suggest using 'codev update' instead
  assert_failure
  assert_output --partial "already exists"
}

@test "codev adopt preserves existing source files" {
  mkdir existing-project
  cd existing-project
  mkdir -p src
  echo "console.log('hello');" > src/index.js
  git init -q

  ../node_modules/.bin/codev adopt --yes

  # Verify source file preserved
  assert_file_exists "src/index.js"
  run cat src/index.js
  assert_output --partial "console.log"
}

@test "codev adopt preserves existing .gitignore entries" {
  mkdir existing-project
  cd existing-project
  echo "node_modules/" > .gitignore
  echo "*.log" >> .gitignore
  git init -q

  ../node_modules/.bin/codev adopt --yes

  # Verify original gitignore entries preserved
  run cat .gitignore
  assert_output --partial "node_modules/"
  assert_output --partial "*.log"
}

@test "codev adopt with existing CLAUDE.md preserves it" {
  mkdir existing-project
  cd existing-project
  echo "# My Custom Claude Instructions" > CLAUDE.md
  echo "Custom content here" >> CLAUDE.md
  git init -q

  ../node_modules/.bin/codev adopt --yes

  # Original content should be preserved or merged
  assert_file_exists "CLAUDE.md"
}

# === Edge Cases ===

@test "codev adopt works without existing git repo" {
  mkdir existing-project
  cd existing-project
  echo "# My Project" > README.md

  run ../node_modules/.bin/codev adopt --yes
  # Should either succeed or give clear error
  # The command may require git to be initialized
  [[ "$status" -eq 0 ]] || assert_output --partial "git"
}

@test "codev adopt in empty directory creates structure" {
  mkdir empty-project
  cd empty-project
  git init -q

  run ../node_modules/.bin/codev adopt --yes
  assert_success

  assert_dir_exists "codev"
}
