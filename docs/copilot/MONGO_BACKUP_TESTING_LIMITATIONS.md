# MongoDB Backup Script Testing Limitations

## Overview

The `scripts/mongo-backup.ts` script has partial test coverage due to technical limitations with mocking Node.js built-in modules (`fs` and `child_process`) in Vitest with ESM.

## Current Test Coverage

### ✅ Passing Tests (9/28 - 32%)

The following functions are fully tested:

1. **parseMongoUri** (7 tests)
   - Standard MongoDB URI parsing
   - MongoDB+srv URI support
   - Query parameter handling
   - Encoded special character support
   - Error handling for missing database names
   - Invalid URI detection
   - URI without database handling

2. **showUsage** (2 tests)
   - Usage information display
   - Examples display

### ❌ Blocked Tests (19/28 - 68%)

The following tests cannot run due to Vitest ESM mocking limitations:

1. **cleanupOldBackups** (6 tests) - Requires `fs` module mocking
2. **dumpDatabase** (7 tests) - Requires `fs` and `child_process` mocking
3. **restoreDatabase** (6 tests) - Requires `fs` and `child_process` mocking

## Technical Challenge

Vitest in ESM mode has strict limitations when mocking Node.js built-in modules. Multiple approaches were attempted:

1. ❌ `vi.mock()` with factory functions
2. ❌ `vi.hoisted()` pattern
3. ❌ `vi.spyOn()` on module exports (not supported in ESM)
4. ❌ `importOriginal` with spread operator
5. ❌ Direct mock replacements

The core issue is that Vitest's module mocking doesn't properly intercept imports of Node.js built-in modules in the target file when using ESM.

## Recommended Solutions

### Option 1: Manual Integration Testing

For critical backup/restore operations, perform manual testing:

```bash
# Create a test backup
npm run mongo:dump

# Verify backup file exists
ls -l backups/

# Test restore (use test database!)
npm run mongo:restore backups/YYYY-MM-DDTHH-MM-SS-mongo-backup.archive
```

### Option 2: Dependency Injection Refactor

Refactor the code to accept dependencies as parameters, making it mockable:

```typescript
export function dumpDatabase(
  backupPath: string,
  dbUrl: string,
  deps = { execSync, existsSync, mkdirSync }
) {
  // Use deps.execSync instead of execSync directly
}
```

This would require updating all call sites but would make the code fully testable.

### Option 3: Wrapper Module

Create a thin wrapper module for fs and child_process that can be mocked:

```typescript
// lib/system-utils.ts
export { execSync } from 'child_process';
export { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
```

Then mock `@/lib/system-utils` instead of the built-in modules.

## Current Status

- **Tested Functions**: parseMongoUri, showUsage ✅
- **Untested Functions**: cleanupOldBackups, dumpDatabase, restoreDatabase ⚠️
- **Coverage Goal**: 90% (currently ~32% due to mocking limitations)
- **Recommendation**: Use Option 3 (Wrapper Module) if higher test coverage is required

## Alternative: End-to-End Testing

Consider adding E2E tests that:

1. Spin up a test MongoDB instance
2. Run actual dump/restore operations
3. Verify data integrity

This would provide more valuable testing than mocked unit tests, as it would catch real-world issues with mongodump/mongorestore commands, file system operations, and data consistency.

## File References

- Implementation: [scripts/mongo-backup.ts](../scripts/mongo-backup.ts)
- Tests: [scripts/mongo-backup.spec.ts](../scripts/mongo-backup.spec.ts)
- Documentation: [scripts/README.md](../scripts/README.md)
- Main README: [README.md](../README.md#database-backups)

## Last Updated

February 7, 2026
