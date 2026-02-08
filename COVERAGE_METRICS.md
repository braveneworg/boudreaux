# Coverage Metrics

This file tracks the test coverage metrics for the Boudreaux project.

## Current Coverage Summary

| Metric     | Coverage |
| ---------- | -------- |
| Statements | 90%      |
| Branches   | 80%      |
| Functions  | 90%      |
| Lines      | 90%      |

**Last Updated:** 2026-02-07

---

## Coverage History

| Date       | Statements | Branches | Functions | Lines  | Notes            |
| ---------- | ---------- | -------- | --------- | ------ | ---------------- |
| 2026-02-07 | 90%        | 80%      | 90%       | 90%    | Updated baseline |
| 2026-02-02 | 90.00%     | 80.00%   | 90.00%    | 90.00% | Initial tracking |

---

## Coverage Targets

Based on the project's [copilot instructions](.github/copilot-instructions.md), the coverage targets are:

- **Minimum Target:** 90-95%+ on all testable files except for branches, which should be at least 85%+.
- **Ideal Target:** 100% on all testable files, including branches.
- **Current Status:** The project is currently above the minimum target for statements, functions, and lines, but slightly below the ideal target for branches. Focus should be on improving branch coverage in key areas to reach the ideal target.

---

## How to Update

Run the following command to generate a new coverage report:

```bash
npm run test:coverage
```

The coverage report will be generated in the `coverage/` directory. Update this file with the new metrics from the summary output.

---

## Excluded Files

The following are excluded from coverage as per project guidelines:

- Configuration files
- Types and interfaces (`.d.ts` files)
- Prisma schema files

---

## Areas for Improvement

### Below 100% Coverage

| File/Area                        | Statements | Branches | Notes                      |
| -------------------------------- | ---------- | -------- | -------------------------- |
| `src/middleware.ts`              | 93.10%     | 88.88%   | Lines 49, 62 uncovered     |
| `src/app/api/tracks/metadata`    | 100%       | 90%      | Line 19 branch uncovered   |
| `src/app/components` (aggregate) | 97.49%     | 87.31%   | Various component branches |

### Component-Level Details

| Component                      | Branches | Uncovered Lines/Branches |
| ------------------------------ | -------- | ------------------------ |
| `cdn-status-banner.tsx`        | 90%      | Lines 42-43              |
| `data-store-health-status.tsx` | 83.67%   | Lines 91, 126, 159, 185  |
| `notification-banner.tsx`      | 82.53%   | Lines 335, 344-346, 370  |
| `auth/` components (aggregate) | 93.18%   | -                        |
