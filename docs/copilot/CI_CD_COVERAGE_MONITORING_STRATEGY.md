# Continuous Integration & Test Coverage Monitoring Strategy

## Overview

This document provides actionable strategies and tool recommendations for maintaining and improving test coverage over time in the Boudreaux project. These practices ensure that the current 100% coverage is preserved and that code quality remains high as the project evolves.

---

## Table of Contents

1. [Pre-commit Hooks](#pre-commit-hooks)
2. [CI/CD Pipeline Configuration](#cicd-pipeline-configuration)
3. [Coverage Monitoring Tools](#coverage-monitoring-tools)
4. [Test Quality Verification](#test-quality-verification)
5. [Development Workflow Integration](#development-workflow-integration)
6. [Team Guidelines](#team-guidelines)

---

## Pre-commit Hooks

### Setup Husky for Git Hooks

Install Husky and lint-staged:

```bash
npm install --save-dev husky lint-staged
npx husky install
npm pkg set scripts.prepare="husky install"
```

### Configure Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### Configure lint-staged

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write", "vitest related --run --coverage"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

**Benefits:**

- ✅ Runs tests on changed files before commit
- ✅ Ensures formatting and linting compliance
- ✅ Catches issues early in development
- ✅ Prevents commits that break tests or coverage

---

## CI/CD Pipeline Configuration

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  push:
    branches: [main, develop, develop/**]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    name: Run Tests with Coverage
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [20.x]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for better coverage diffs

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run type check
        run: npx tsc --noEmit

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: true

      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: ./coverage/lcov.info
          github-token: ${{ secrets.GITHUB_TOKEN }}
          delete-old-comments: true

      - name: Archive coverage artifacts
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 30

      - name: Check coverage thresholds
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 100" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 100% threshold"
            exit 1
          fi
          echo "Coverage: $COVERAGE%"

  build:
    name: Build Application
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

### GitLab CI/CD

Create `.gitlab-ci.yml`:

```yaml
image: node:20

stages:
  - install
  - test
  - build
  - deploy

cache:
  paths:
    - node_modules/
    - .npm/

install_dependencies:
  stage: install
  script:
    - npm ci --cache .npm --prefer-offline
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

test:
  stage: test
  coverage: '/All files\s+\|\s+[\d.]+\s+\|\s+([\d.]+)/'
  script:
    - npm run lint
    - npm run test:coverage
  artifacts:
    when: always
    paths:
      - coverage/
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_BRANCH =~ /^develop/'

build:
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - .next/
    expire_in: 1 week
  needs:
    - test

pages:
  stage: deploy
  dependencies:
    - test
  script:
    - mkdir -p public
    - cp -r coverage/lcov-report/* public/
  artifacts:
    paths:
      - public
  only:
    - main
```

---

## Coverage Monitoring Tools

### 1. Codecov

**Setup:**

```bash
# Install Codecov
npm install --save-dev @codecov/codecov-action

# Add codecov.yml configuration
```

Create `codecov.yml`:

```yaml
coverage:
  precision: 2
  round: down
  range: 90..100
  status:
    project:
      default:
        target: 100%
        threshold: 0%
        if_ci_failed: error
    patch:
      default:
        target: 100%
        threshold: 0%

comment:
  layout: 'header, diff, flags, files'
  behavior: default
  require_changes: false

ignore:
  - '**/*.spec.ts'
  - '**/*.spec.tsx'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/node_modules/**'
  - '**/.next/**'
  - '**/coverage/**'
```

**Features:**

- 📊 Beautiful coverage reports
- 💬 Automatic PR comments with coverage diff
- 📈 Historical coverage trends
- 🔔 Slack/email notifications on coverage changes
- ⚠️ Fail CI if coverage drops

### 2. Coveralls

**Setup:**

```bash
npm install --save-dev coveralls
```

Add to `.github/workflows/test.yml`:

```yaml
- name: Upload to Coveralls
  uses: coverallsapp/github-action@v2
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    path-to-lcov: ./coverage/lcov.info
```

### 3. SonarQube/SonarCloud

**Setup:**

```bash
npm install --save-dev sonarqube-scanner
```

Create `sonar-project.properties`:

```properties
sonar.projectKey=braveneworg_boudreaux
sonar.organization=braveneworg
sonar.sources=src
sonar.tests=src
sonar.test.inclusions=**/*.spec.ts,**/*.spec.tsx,**/*.test.ts,**/*.test.tsx
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.coverage.exclusions=**/*.spec.ts,**/*.spec.tsx,**/*.test.ts,**/*.test.tsx
sonar.cpd.exclusions=**/*.spec.ts,**/*.spec.tsx
```

Add to GitHub Actions:

```yaml
- name: SonarCloud Scan
  uses: SonarSource/sonarcloud-github-action@master
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### 4. Code Climate

**Setup:**

```yaml
- name: Test & publish code coverage
  uses: paambaati/codeclimate-action@v5
  env:
    CC_TEST_REPORTER_ID: ${{ secrets.CC_TEST_REPORTER_ID }}
  with:
    coverageCommand: npm run test:coverage
    coverageLocations: |
      ${{github.workspace}}/coverage/lcov.info:lcov
```

---

## Test Quality Verification

### 1. Mutation Testing with Stryker

**Setup:**

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
npx stryker init
```

Configure `stryker.conf.json`:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress", "dashboard"],
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutate": ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.spec.ts", "!src/**/*.spec.tsx"],
  "thresholds": {
    "high": 90,
    "low": 70,
    "break": 80
  }
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "test:mutation": "stryker run",
    "test:mutation:ci": "stryker run --concurrency 4"
  }
}
```

**Benefits:**

- Verifies test quality by introducing mutations
- Identifies weak tests that pass despite code changes
- Provides mutation score as a quality metric
- Helps achieve truly effective testing

### 2. Test Complexity Analysis

Install complexity reporters:

```bash
npm install --save-dev vitest-sonar-reporter
```

Update `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    reporters: ['default', 'vitest-sonar-reporter'],
    outputFile: {
      'vitest-sonar-reporter': './coverage/sonar-report.xml',
    },
  },
});
```

### 3. Snapshot Testing Review

Add script to detect stale snapshots:

```json
{
  "scripts": {
    "test:snapshots": "vitest run -u",
    "test:snapshots:review": "git diff --exit-code **/*.snap"
  }
}
```

---

## Development Workflow Integration

### VS Code Integration

Install VS Code extensions:

- **Vitest** (`vitest.explorer`) - Test explorer
- **Coverage Gutters** (`ryanluker.vscode-coverage-gutters`) - Inline coverage
- **Test Explorer UI** (`hbenl.vscode-test-explorer`) - Unified test UI

Create `.vscode/settings.json`:

```json
{
  "vitest.enable": true,
  "vitest.commandLine": "npm run test",
  "coverage-gutters.coverageFileNames": ["coverage/lcov.info"],
  "coverage-gutters.showLineCoverage": true,
  "coverage-gutters.showRulerCoverage": true,
  "testing.automaticallyOpenPeekView": "failureInVisibleDocument"
}
```

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:coverage:watch": "vitest --coverage --watch",
    "test:coverage:ui": "vitest --ui --coverage",
    "test:mutation": "stryker run",
    "test:changed": "vitest related --run",
    "test:debug": "vitest --inspect-brk --inspect --single-thread",
    "test:all": "npm run lint && npm run test:coverage && npm run test:mutation"
  }
}
```

### Git Hooks for Coverage

Create `.husky/pre-push`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🧪 Running tests with coverage before push..."
npm run test:coverage

if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Push aborted."
  exit 1
fi

echo "✅ All tests passed!"
```

---

## Team Guidelines

### 1. Pull Request Requirements

**Checklist for PR Authors:**

- [ ] All tests pass locally
- [ ] Coverage remains at 100%
- [ ] New features have corresponding tests
- [ ] Test names are descriptive
- [ ] No commented-out tests
- [ ] No `.only` or `.skip` in committed tests
- [ ] Mutation testing passes (if applicable)

**Checklist for Reviewers:**

- [ ] Test coverage is maintained
- [ ] Tests are meaningful and not trivial
- [ ] Edge cases are covered
- [ ] Mocks are appropriate
- [ ] Test names follow conventions
- [ ] No duplicate tests

### 2. Coverage Enforcement

**Branch Protection Rules:**

```yaml
# GitHub branch protection
required_status_checks:
  strict: true
  contexts:
    - 'test (20.x)'
    - 'codecov/project'
    - 'codecov/patch'

required_pull_request_reviews:
  required_approving_review_count: 1
  dismiss_stale_reviews: true
  require_code_owner_reviews: true

enforce_admins: true
```

### 3. Test-Driven Development (TDD)

**Recommended Workflow:**

1. Write failing test for new feature
2. Run test to confirm it fails
3. Write minimal code to make test pass
4. Refactor while keeping tests green
5. Verify coverage remains 100%

**Example:**

```typescript
// 1. Write test first
it('should format user name correctly', () => {
  expect(formatUserName({ firstName: 'John', lastName: 'Doe' }))
    .toBe('John Doe');
});

// 2. Run test - it fails (formatUserName doesn't exist)

// 3. Implement function
const formatUserName = (user) => `${user.firstName} ${user.lastName}`;

// 4. Test passes - refactor if needed

// 5. Verify coverage
npm run test:coverage
```

### 4. Documentation Standards

For each new component:

1. Create component file
2. Create test file (`.spec.tsx`)
3. Create documentation file (`COMPONENT_NAME_TESTING.md`)
4. Update main README with component info

### 5. Monthly Quality Review

Schedule monthly meetings to:

- Review coverage trends
- Discuss test quality improvements
- Share testing best practices
- Update testing guidelines
- Review mutation testing results
- Plan testing infrastructure improvements

---

## Monitoring Dashboard

### Setup Coverage Badge

Add to `README.md`:

```markdown
[![codecov](https://codecov.io/gh/braveneworg/boudreaux/branch/main/graph/badge.svg)](https://codecov.io/gh/braveneworg/boudreaux)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=braveneworg_boudreaux&metric=alert_status)](https://sonarcloud.io/dashboard?id=braveneworg_boudreaux)
[![Tests](https://github.com/braveneworg/boudreaux/workflows/Test%20Suite/badge.svg)](https://github.com/braveneworg/boudreaux/actions)
```

### Custom Coverage Report Page

Create `scripts/generate-coverage-report.ts`:

```typescript
import fs from 'fs';
import path from 'path';

const coverageSummary = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf-8'));

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Coverage Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .metric { display: inline-block; margin: 20px; }
    .perfect { color: green; }
    .good { color: orange; }
    .poor { color: red; }
  </style>
</head>
<body>
  <h1>Boudreaux Test Coverage</h1>
  <div class="metric">
    <h2>Statements</h2>
    <p class="perfect">${coverageSummary.total.statements.pct}%</p>
  </div>
  <div class="metric">
    <h2>Branches</h2>
    <p class="perfect">${coverageSummary.total.branches.pct}%</p>
  </div>
  <div class="metric">
    <h2>Functions</h2>
    <p class="perfect">${coverageSummary.total.functions.pct}%</p>
  </div>
  <div class="metric">
    <h2>Lines</h2>
    <p class="perfect">${coverageSummary.total.lines.pct}%</p>
  </div>
</body>
</html>
`;

fs.writeFileSync('public/coverage-report.html', html);
```

---

## Troubleshooting Guide

### Coverage Drops Unexpectedly

**Diagnosis:**

```bash
# Find uncovered lines
npm run test:coverage
open coverage/lcov-report/index.html

# Check which files need tests
grep -r "0%" coverage/lcov-report/*.html
```

**Solution:**

1. Identify uncovered files/lines in HTML report
2. Write tests for uncovered code paths
3. Re-run coverage verification
4. Commit tests with changes

### Tests Pass Locally But Fail in CI

**Common Causes:**

- Environment variable differences
- Timezone issues
- File path differences (Windows vs Unix)
- Race conditions in async tests

**Solution:**

```typescript
// Use consistent environment
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('TZ', 'UTC');

// Use waitFor for async operations
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Use path.join for cross-platform paths
const filePath = path.join(__dirname, 'test-file.txt');
```

### Slow Test Execution

**Optimization:**

```typescript
// Parallel test execution
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
      },
    },
  },
});

// Isolate heavy tests
describe('heavy tests', () => {
  it.concurrent('test 1', async () => {
    /* ... */
  });
  it.concurrent('test 2', async () => {
    /* ... */
  });
});
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

Track these metrics:

1. **Coverage Percentage**: Maintain 100%
2. **Test Count**: Should increase with features
3. **Test Execution Time**: Aim for < 10s for unit tests
4. **Mutation Score**: Target > 80%
5. **PR Review Time**: Faster with automated checks
6. **Bug Escape Rate**: Bugs found in production
7. **Code Churn**: Tests updated vs new tests

### Dashboard Example

```typescript
{
  "coverage": {
    "statements": 100,
    "branches": 100,
    "functions": 100,
    "lines": 100
  },
  "tests": {
    "total": 46,
    "passed": 46,
    "failed": 0,
    "skipped": 0
  },
  "performance": {
    "avgExecutionTime": "8.2s",
    "slowestTest": "auth-toolbar.spec.tsx (1.2s)"
  },
  "quality": {
    "mutationScore": 85,
    "codeSmells": 0,
    "technicalDebt": "0h"
  }
}
```

---

## Conclusion

Implementing these strategies ensures:
✅ Continuous monitoring of test coverage
✅ Early detection of coverage drops
✅ Automated quality checks in CI/CD
✅ Team accountability for testing
✅ Long-term maintainability

**Remember**: Tools are only as effective as the team's commitment to using them. Regular reviews, clear guidelines, and automated enforcement are key to maintaining 100% coverage over time.

---

## Resources

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Codecov Documentation](https://docs.codecov.com/)

### Tools

- [Codecov](https://codecov.io/)
- [SonarCloud](https://sonarcloud.io/)
- [Stryker Mutator](https://stryker-mutator.io/)
- [Husky](https://typicode.github.io/husky/)

### Best Practices

- [Google Testing Blog](https://testing.googleblog.com/)
- [Kent C. Dodds Testing](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Martin Fowler on Testing](https://martinfowler.com/testing/)
