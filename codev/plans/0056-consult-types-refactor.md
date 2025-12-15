# Plan 0056: Consult Types Refactor

## Overview

Move consult review types from `roles/review-types/` to `consult-types/` with backward compatibility fallback.

## Implementation Phases

### Phase 1: Create New Directory Structure in Skeleton

**Important:** The skeleton source is `codev-skeleton/`, NOT `packages/codev/skeleton/` (which is a build artifact).

**Files to create:**
- `codev-skeleton/consult-types/spec-review.md`
- `codev-skeleton/consult-types/plan-review.md`
- `codev-skeleton/consult-types/impl-review.md`
- `codev-skeleton/consult-types/pr-ready.md`
- `codev-skeleton/consult-types/integration-review.md`

**Actions:**
1. Copy files from `codev-skeleton/roles/review-types/` to `codev-skeleton/consult-types/`
2. Delete `codev-skeleton/roles/review-types/` directory
3. Run `npm run copy-skeleton` in `packages/codev/` to sync to build artifact

### Phase 2: Update Consult CLI

**File:** `packages/codev/src/commands/consult/index.ts`

**Changes:**
1. Update `loadReviewType()` function to:
   - First check `codev/consult-types/{type}.md`
   - Fall back to `codev/roles/review-types/{type}.md` with deprecation warning
   - Error if not found in either location

```typescript
function loadReviewType(codevDir: string, type: string): string {
  const primaryPath = path.join(codevDir, 'consult-types', `${type}.md`);
  const fallbackPath = path.join(codevDir, 'roles', 'review-types', `${type}.md`);

  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf-8');
  }

  if (fs.existsSync(fallbackPath)) {
    console.error(chalk.yellow('Warning: Review types in roles/review-types/ are deprecated.'));
    console.error(chalk.yellow('Move your custom types to consult-types/ for future compatibility.'));
    return fs.readFileSync(fallbackPath, 'utf-8');
  }

  throw new Error(`Review type '${type}' not found in consult-types/`);
}
```

### Phase 3: Update Doctor Command

**File:** `packages/codev/src/commands/doctor.ts`

**Changes:**
Add two new checks:

1. **Check for consult-types directory:**
```typescript
// Warn if consult-types/ is missing (not error - migration grace period)
const consultTypesDir = path.join(codevDir, 'consult-types');
if (!fs.existsSync(consultTypesDir)) {
  warn('consult-types/ directory not found - review types may not work correctly');
}
```

2. **Check for deprecated review-types:**
```typescript
// Warn if old location still exists
const oldReviewTypes = path.join(codevDir, 'roles', 'review-types');
if (fs.existsSync(oldReviewTypes)) {
  warn('Deprecated: roles/review-types/ still exists. Move contents to consult-types/');
}
```

### Phase 4: Update Local Project (codev/)

**Actions:**
1. Create `codev/consult-types/` directory
2. Move files from `codev/roles/review-types/` to `codev/consult-types/`
3. Delete `codev/roles/review-types/` directory

### Phase 5: Audit for Old Path References

**Action:** Search entire codebase for remaining references to old path:

```bash
grep -r "roles/review-types" --include="*.ts" --include="*.md" --include="*.json" .
```

Update any found references to use `consult-types/` instead.

**Known files to check:**
- `CLAUDE.md`
- `AGENTS.md`
- `codev/docs/commands/consult.md`
- `codev-skeleton/docs/commands/consult.md`
- Any prompts or templates

### Phase 6: Update Documentation

**Files to update:**

1. **CLAUDE.md** - Update "Review Types" section:
   - Change path references from `codev/roles/review-types/` to `codev/consult-types/`
   - Add migration note

2. **AGENTS.md** - Same changes as CLAUDE.md

3. **codev/docs/commands/consult.md** - Update review types location

4. **codev-skeleton/docs/commands/consult.md** - Update skeleton docs

### Phase 7: Add Release Notes

**File:** Create or update release notes file (e.g., `docs/CHANGELOG.md` or version-specific notes)

**Content to add:**
```markdown
## Migration Notes

### Review Types Location Change

Review types have moved from `codev/roles/review-types/` to `codev/consult-types/`.

**Backward compatibility:** The old location still works with a deprecation warning.
The fallback will be removed in a future major version.

**To migrate:**
1. `mkdir -p codev/consult-types`
2. `mv codev/roles/review-types/* codev/consult-types/`
3. `rm -r codev/roles/review-types`
4. Run `codev doctor` to verify
```

### Phase 8: Add Tests

**File:** `packages/codev/src/__tests__/consult.test.ts`

**New tests:**
1. Test loading type from `consult-types/`
2. Test fallback to `roles/review-types/` with warning
3. Test error when type not found

**File:** `packages/codev/src/__tests__/doctor.test.ts`

**New tests:**
1. Test warning when `consult-types/` missing
2. Test warning when `roles/review-types/` exists
3. Test no warnings when properly migrated

## File Summary

| File | Action |
|------|--------|
| `codev-skeleton/consult-types/*.md` | Create (copy from review-types) |
| `codev-skeleton/roles/review-types/` | Delete |
| `packages/codev/src/commands/consult/index.ts` | Modify (add fallback logic) |
| `packages/codev/src/commands/doctor.ts` | Modify (add checks) |
| `codev/consult-types/*.md` | Create (move from review-types) |
| `codev/roles/review-types/` | Delete |
| `CLAUDE.md` | Modify (update paths) |
| `AGENTS.md` | Modify (update paths) |
| `codev/docs/commands/consult.md` | Modify (update paths) |
| `codev-skeleton/docs/commands/consult.md` | Modify (update paths) |
| `docs/CHANGELOG.md` or release notes | Modify (add migration notes) |
| `packages/codev/src/__tests__/consult.test.ts` | Modify (add tests) |
| `packages/codev/src/__tests__/doctor.test.ts` | Modify (add tests) |

## Risks

1. **Missed references**: Old path might be referenced in unexpected places
   - Mitigation: Phase 5 audit step with grep
2. **Build artifact confusion**: Editing wrong skeleton directory
   - Mitigation: Explicit note in Phase 1, always use `codev-skeleton/`

## Verification

1. Run `consult --model gemini spec 56 --type spec-review` - should work from new location
2. Temporarily move a type back to old location - should work with warning
3. Run `codev doctor` - should show no warnings after migration
4. Run `grep -r "roles/review-types"` - should find no references
5. Run test suite - all tests should pass
