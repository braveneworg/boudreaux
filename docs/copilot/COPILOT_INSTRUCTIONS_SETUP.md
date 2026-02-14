# Copilot Instructions Setup

## Summary

This document describes the setup and configuration of GitHub Copilot instructions for the Boudreaux repository.

## Overview

GitHub Copilot instructions provide context and guidelines to GitHub Copilot when generating code suggestions and responses. These instructions are stored in `.github/copilot-instructions.md` and are automatically read by Copilot when working in the repository.

## Changes Made

### 1. Updated Project Context

**File:** `.github/copilot-instructions.md`

**Change:** Updated Next.js version from v15.5.0 to v16.1.6+

**Reason:** The version in the instructions was outdated and didn't match the actual version in package.json. Accurate version information helps Copilot provide suggestions that are compatible with the current technology stack.

### 2. Added Development Workflow Section

**File:** `.github/copilot-instructions.md`

**Change:** Added a new "Development Workflow" section with common development commands

**Content:**

- Development server commands (`npm run dev`)
- Build commands (`npm run build`)
- Linting and formatting commands (`npm run lint`, `npm run format`)
- Testing commands (`npm run test`, `npm run test:coverage`)
- Best practices reminders

**Reason:** This section provides Copilot with context about the development workflow, enabling it to:

- Suggest appropriate commands when discussing development tasks
- Understand the testing and quality assurance processes
- Provide accurate guidance about how to run and test the application

### 3. Improved Pre-push Hook

**File:** `.husky/pre-push`

**Change:** Modified test execution to use dot reporter and silent mode

**Before:**

```bash
npm run test:run -- --exclude src/app/components/ui/sticky-breadcrumb-wrapper.spec.tsx
```

**After:**

```bash
SUPPRESS_CONSOLE=1 npm run test:run -- --exclude src/app/components/ui/sticky-breadcrumb-wrapper.spec.tsx --reporter=dot --silent
```

**Reason:** The verbose test output from some tests (particularly those simulating large file uploads) was overwhelming the git push process, causing push failures with "exit code null". The dot reporter provides minimal, clean output while still running all tests and reporting failures appropriately.

## Current Copilot Instructions Structure

The `.github/copilot-instructions.md` file now contains the following sections:

1. **Persona** - Defines the expertise level and approach for Copilot
2. **Code Review** - Guidelines for reviewing code
3. **Project Context** - Technology stack and project overview
4. **Key Rules** - Organized by topic:
   - Design
   - Components
   - Forms
   - Data Fetching
   - File Structure
   - Development Workflow (NEW)
   - Naming Conventions
   - Styling
   - Testing
5. **Always Do** - List of required practices
6. **Never Do** - List of anti-patterns to avoid

## Best Practices Applied

✅ **Location:** Instructions are in the standard location (`.github/copilot-instructions.md`)  
✅ **Accuracy:** Version numbers and project details are current  
✅ **Completeness:** All major aspects of development are covered  
✅ **Specificity:** Instructions are specific to this project's tech stack and conventions  
✅ **Actionable:** Includes concrete commands and examples  
✅ **Maintainable:** Clear structure makes it easy to update as the project evolves

## Verification

All changes have been:

- ✅ Committed and pushed to the remote repository
- ✅ Reviewed by automated code review (no issues found)
- ✅ Scanned by CodeQL (no security issues)
- ✅ Validated for Prettier formatting compliance
- ✅ Tested with the improved pre-push hook

## Next Steps

To keep Copilot instructions effective:

1. **Update as needed:** When major dependencies are upgraded, update the version numbers in the Project Context section
2. **Expand as the project grows:** Add new sections when new patterns or conventions are established
3. **Review periodically:** Ensure the instructions remain accurate and helpful
4. **Leverage in development:** Use Copilot with confidence that it has accurate context about the project

## References

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Best Practices for Copilot Instructions](https://gh.io/copilot-coding-agent-tips)
- Repository Copilot Instructions: [.github/copilot-instructions.md](../../.github/copilot-instructions.md)

## Conclusion

The Copilot instructions are now properly configured with accurate, comprehensive guidance for code generation in this repository. The instructions provide Copilot with the context it needs to generate high-quality, project-appropriate suggestions.
