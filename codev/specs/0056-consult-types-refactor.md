# Spec 0056: Consult Types Refactor

## Summary

Relocate consult review types from `codev/roles/review-types/` to a new `codev/consult-types/` directory, making them more discoverable and clearly indicating they are user-editable prompt templates.

## Problem Statement

Currently, consult review types live at `codev/roles/review-types/`. This location has issues:

1. **Discoverability**: Users don't naturally look in `roles/` for consultation prompts
2. **Semantic mismatch**: These aren't "roles" - they're stage-specific review prompts for the `consult --type` parameter
3. **Documentation fragmentation**: The CLAUDE.md mentions `codev/roles/review-types/` but users expect a more obvious location

## Proposed Solution

Move review types to a dedicated top-level directory:

```
codev/
├── consult-types/           # NEW - Stage-specific review prompts
│   ├── spec-review.md       # Specification review
│   ├── plan-review.md       # Plan review
│   ├── impl-review.md       # Implementation review
│   ├── pr-ready.md          # Pre-PR self-check
│   └── integration-review.md # Architect integration review
├── roles/
│   ├── architect.md
│   ├── builder.md
│   └── consultant.md        # Base consultant role (stays here)
```

## Requirements

### Functional
1. Create new `codev/consult-types/` directory
2. Move all files from `roles/review-types/` to `consult-types/`
3. Update the `consult` CLI to look in `consult-types/` instead of `roles/review-types/`
4. Update the skeleton to include `consult-types/` directory
5. Update documentation (CLAUDE.md, AGENTS.md, command docs)

### Non-Functional
1. No breaking changes to the `consult --type` CLI interface

## Backward Compatibility

The CLI should implement a fallback strategy for existing projects:

1. **Primary**: Look for type in `codev/consult-types/{type}.md`
2. **Fallback**: If not found, look in `codev/roles/review-types/{type}.md`
3. **Warning**: If fallback is used, print a deprecation warning:
   ```
   Warning: Review types in roles/review-types/ are deprecated.
   Move your custom types to consult-types/ for future compatibility.
   ```

The fallback will be removed in a future major version (document in release notes).

## Acceptance Criteria

1. `consult --model gemini spec 42 --type spec-review` reads from `codev/consult-types/spec-review.md`
2. Users can add custom types by creating new `.md` files in `consult-types/`
3. The skeleton contains the new `consult-types/` directory structure
4. Documentation accurately reflects the new location
5. `codev doctor` warns if `consult-types/` is missing (not error - for migration grace period)
6. `codev doctor` warns if old `roles/review-types/` still exists with guidance to migrate
7. Fallback to `roles/review-types/` works with deprecation warning

## Out of Scope

- Changing the format of review type prompts
- Adding new review types
- Changing the base consultant role behavior

## Files to Modify

### TypeScript Implementation
- `packages/codev/src/commands/consult/index.ts` - Update path lookup with fallback
- `packages/codev/src/commands/doctor.ts` - Add consult-types validation

### Skeleton
- `packages/codev/skeleton/consult-types/` - Create new directory with files
- `packages/codev/skeleton/roles/review-types/` - Delete this directory

### Documentation
- `CLAUDE.md` - Update review types section, add migration note
- `AGENTS.md` - Update review types section, add migration note
- `codev/docs/commands/consult.md` - Update review types reference
- `codev-skeleton/docs/commands/consult.md` - Update skeleton docs

### Local Project (codev/)
- `codev/consult-types/` - Create with files moved from roles/review-types/
- `codev/roles/review-types/` - Delete this directory

## Technical Notes

The `consult` CLI currently loads review types like this:
```typescript
// Current implementation looks for review types in roles/review-types/
const reviewTypePath = path.join(codevDir, 'roles', 'review-types', `${type}.md`);
```

This needs to change to:
```typescript
// New implementation with fallback
const primaryPath = path.join(codevDir, 'consult-types', `${type}.md`);
const fallbackPath = path.join(codevDir, 'roles', 'review-types', `${type}.md`);

if (fs.existsSync(primaryPath)) {
  reviewTypePath = primaryPath;
} else if (fs.existsSync(fallbackPath)) {
  console.warn(`Warning: Review types in roles/review-types/ are deprecated.`);
  console.warn(`Move your custom types to consult-types/ for future compatibility.`);
  reviewTypePath = fallbackPath;
} else {
  throw new Error(`Review type '${type}' not found in consult-types/`);
}
```

## Testing

### Unit Tests (consult command)
- Test loading type from `consult-types/`
- Test fallback to `roles/review-types/` with warning output
- Test error when type not found in either location
- Test custom type in `consult-types/` is discovered

### Integration Tests (doctor command)
- Test warning when `consult-types/` directory missing
- Test warning when `roles/review-types/` still exists
- Test no warnings when properly migrated

## Migration Guide

Include in documentation:

```markdown
## Migrating Review Types (v1.4.0+)

Review types have moved from `codev/roles/review-types/` to `codev/consult-types/`.

**To migrate:**
1. Create the new directory: `mkdir -p codev/consult-types`
2. Move your types: `mv codev/roles/review-types/* codev/consult-types/`
3. Remove old directory: `rm -r codev/roles/review-types`
4. Run `codev doctor` to verify

Custom review types you've created will continue to work in the old location
with a deprecation warning until the next major version.
```
