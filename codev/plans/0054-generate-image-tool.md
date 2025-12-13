# Plan 0054: Generate Image Tool

## Implementation Steps

### Phase 1: Create TypeScript Tool

1. **Create source file**
   - Create `packages/codev/src/commands/generate-image/index.ts`
   - Port logic from `../../writing/tools/generate_image.py` to TypeScript
   - Use Commander.js for CLI

2. **Add dependencies**
   - Add `@google/genai` to package.json

### Phase 2: Integration

3. **Wire up the command**
   - Add bin entry in package.json: `"generate-image": "./dist/commands/generate-image/index.js"`
   - Test with actual API key

4. **Documentation**
   - Add usage to CLI reference docs

## Files to Modify

- `packages/codev/src/commands/generate-image/index.ts` (NEW)
- `packages/codev/package.json` (add dep and bin entry)
- `codev/docs/commands/overview.md` (add to tool list)

## Testing

- Manual test with GEMINI_API_KEY
- Test each model option
- Test reference image feature
