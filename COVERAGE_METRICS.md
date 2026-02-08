# Coverage Metrics

This file tracks the test coverage metrics for the Boudreaux project.

## Current Coverage Summary

| Metric     | Coverage |
| ---------- | -------- |
| Statements | 95.78%   |
| Branches   | 89.13%   |
| Functions  | 95.20%   |
| Lines      | 96.04%   |

**Last Updated:** 2026-02-07

---

## Coverage History

| Date       | Statements | Branches | Functions | Lines  | Notes            |
| ---------- | ---------- | -------- | --------- | ------ | ---------------- |
| 2026-02-07 | 90.00%     | 80.00%   | 90.00%    | 90.00% | Updated baseline |
| 2026-02-02 | 90.00%     | 80.00%   | 90.00%    | 90.00% | Initial tracking |

---

## Coverage Targets

Based on the project's [copilot instructions](.github/copilot-instructions.md), the coverage targets are:

- **Minimum Target:** 90-95%+ on all testable files except for branches, which should be at least 80%+.
- **Ideal Target:** 100% on all testable files, including branches.
- **Current Status:** The project is currently above the minimum target for statements, functions, and lines, but slightly below the ideal target for branches. Focus should be on improving branch coverage in key areas to reach the ideal target.

### Coverage Regression Policy

The project uses automated coverage regression checking during builds:

- **Tolerance:** Up to **2% decrease** is permitted for any metric
- **Condition:** The metric must remain **above the configured threshold**
- **Thresholds:**
  - Statements: 95%
  - Branches: 85%
  - Functions: 95%
  - Lines: 95%

**Examples:**

- ✅ Statements: 97% → 95.5% (within 2% tolerance, above 95% threshold)
- ❌ Statements: 97% → 94.5% (within 2% tolerance, but **below** 95% threshold)
- ❌ Statements: 97% → 94% (exceeds 2% tolerance)

This policy allows for minor coverage decreases due to new code additions while maintaining overall quality standards.

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
