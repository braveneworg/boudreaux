# CI/CD Status Badges Setup Guide

## Overview

This repository uses GitHub Actions for continuous integration and deployment with comprehensive quality gates including tests, linting, type checking, and automated deployment.

## Available Badges

### 1. CI Status Badge (All Quality Gates)

```markdown
[![CI](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml/badge.svg)](https://github.com/braveneworg/boudreaux/actions/workflows/ci.yml)
```

Shows the combined status of:

- ✅ Unit tests with Vitest
- ✅ ESLint (no errors or warnings)
- ✅ TypeScript type checking (`tsc --noEmit`)
- ✅ Build verification

### 2. Deployment Status Badge

```markdown
[![Deploy](https://github.com/braveneworg/boudreaux/actions/workflows/deploy.yml/badge.svg)](https://github.com/braveneworg/boudreaux/actions/workflows/deploy.yml)
```

Shows the status of the production deployment pipeline including multi-arch Docker builds and EC2 deployment.

### 3. Code Coverage Badge (Codecov)

```markdown
[![codecov](https://codecov.io/gh/braveneworg/boudreaux/branch/main/graph/badge.svg)](https://codecov.io/gh/braveneworg/boudreaux)
```

**Setup Required:**

1. Go to [codecov.io](https://codecov.io)
2. Sign in with GitHub
3. Add the `braveneworg/boudreaux` repository
4. Copy the token
5. Add `CODECOV_TOKEN` secret to GitHub repo settings

### 4. License Badge

```markdown
[![License](https://img.shields.io/github/license/braveneworg/boudreaux)](LICENSE)
```

Displays the repository license (auto-detected from LICENSE file).

### 5. Node Version Badge

```markdown
[![Node Version](https://img.shields.io/badge/node-22.x-brightgreen.svg)](package.json)
```

Shows the Node.js version requirement.

### 6. Next.js Version Badge

```markdown
[![Next.js](https://img.shields.io/badge/Next.js-15.5.0-black)](https://nextjs.org)
```

Displays the Next.js framework version.

## Additional Recommended Badges

### Docker Image Size

```markdown
[![Docker Image Size](https://img.shields.io/docker/image-size/braveneworg/boudreaux/latest)](https://github.com/braveneworg/boudreaux/pkgs/container/boudreaux%2Fwebsite)
```

### Security Scan (Snyk)

```markdown
[![Known Vulnerabilities](https://snyk.io/test/github/braveneworg/boudreaux/badge.svg)](https://snyk.io/test/github/braveneworg/boudreaux)
```

**Setup:**

1. Go to [snyk.io](https://snyk.io)
2. Connect GitHub repo
3. Add badge from Snyk dashboard

### Uptime Status (UptimeRobot)

```markdown
[![Uptime](https://img.shields.io/uptimerobot/ratio/m123456789-abcdef1234567890)](https://stats.uptimerobot.com/abc123)
```

**Setup:**

1. Create account at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor for `https://fakefourrecords.com`
3. Get monitor ID and create badge

### Dependencies Status (Dependabot)

```markdown
[![Dependencies](https://img.shields.io/librariesio/github/braveneworg/boudreaux)](https://github.com/braveneworg/boudreaux/network/dependencies)
```

Auto-enabled when you enable Dependabot in GitHub repo settings.

## CI/CD Pipeline Architecture

### CI Workflow (`ci.yml`)

Runs on **all branches** and **pull requests**:

```
┌─────────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────┐
│   Tests     │  │   Lint   │  │  TypeCheck  │  │  Build Check │
│  (Vitest)   │  │ (ESLint) │  │    (tsc)    │  │  (Next.js)   │
└─────────────┘  └──────────┘  └─────────────┘  └──────────────┘
       │              │                │                 │
       └──────────────┴────────────────┴─────────────────┘
                            │
                    All must pass ✓
```

**Fail Conditions:**

- Any test fails
- ESLint errors or warnings
- TypeScript type errors
- Build fails

### Deploy Workflow (`deploy.yml`)

Runs only on **main branch** after CI passes:

```
┌──────────────────┐
│  Quality Gates   │ ← Tests, Lint, TypeCheck
└────────┬─────────┘
         │ (blocks if fails)
         ↓
┌────────────────────────────────────────┐
│         build-nextjs                   │
│  - Build Next.js                       │
│  - Create artifact                     │
└───────────┬────────────────────────────┘
            ├─────────────┬──────────────┐
            ↓             ↓              ↓
    ┌───────────┐  ┌─────────────┐  (parallel)
    │ sync-cdn  │  │build-images │
    │ (S3/CF)   │  │ (Docker)    │
    └─────┬─────┘  └──────┬──────┘
          └────────┬───────┘
                   ↓
           ┌───────────────┐
           │    deploy     │
           │    (EC2)      │
           └───────────────┘
```

## Workflow Configuration

### Quality Gates Job

```yaml
quality-gates:
  name: Quality Gates (Tests, Lint, Type Check)
  runs-on: ubuntu-latest
  steps:
    - TypeScript type checking: npx tsc --noEmit
    - ESLint: npm run lint
    - Unit tests: npm test -- --run --reporter=verbose
    - Coverage: npm test -- --run --coverage
    - Upload to Codecov
```

### Build Jobs

- `build-nextjs`: Depends on `quality-gates`
- `sync-cdn`: Depends on `build-nextjs` (parallel with images)
- `build-images`: Depends on `build-nextjs` (parallel with CDN)
- `deploy`: Depends on `[build-images, sync-cdn]`

## Required GitHub Secrets

### For CI/CD Pipeline

- `CODECOV_TOKEN` - Optional, for coverage reporting
- `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` - For builds
- All deployment secrets (see `.env.example`)

## Badge Customization

### Custom Badge Colors

You can customize badge colors using shields.io:

```markdown
![Custom](https://img.shields.io/badge/custom-message-blue)
![Custom](https://img.shields.io/badge/custom-message-success)
![Custom](https://img.shields.io/badge/custom-message-important)
![Custom](https://img.shields.io/badge/custom-message-critical)
```

### Dynamic Badges

For package version from package.json:

```markdown
![Version](https://img.shields.io/github/package-json/v/braveneworg/boudreaux)
```

For last commit:

```markdown
![Last Commit](https://img.shields.io/github/last-commit/braveneworg/boudreaux)
```

For contributors:

```markdown
![Contributors](https://img.shields.io/github/contributors/braveneworg/boudreaux)
```

## Monitoring Quality Over Time

### Codecov Dashboard

- Visit: https://codecov.io/gh/braveneworg/boudreaux
- View coverage trends
- Set coverage targets
- Get PR comments with coverage diff

### GitHub Actions Insights

- Visit: https://github.com/braveneworg/boudreaux/actions
- View workflow runs
- Check timing trends
- Identify slow tests

## Best Practices

1. **Keep badges up-to-date** - Update version badges when upgrading
2. **Monitor failing workflows** - Fix broken builds immediately
3. **Review coverage trends** - Aim for 80%+ coverage
4. **Update dependencies** - Keep security vulnerabilities low
5. **Document badge requirements** - Make setup clear for contributors

## Troubleshooting

### Badge Not Updating

- Clear GitHub cache: Add `?timestamp=$(date +%s)` to badge URL
- Check workflow runs are completing
- Verify badge URL matches repository structure

### Coverage Not Uploading

- Check `CODECOV_TOKEN` is set
- Verify `coverage/lcov.info` exists after test run
- Check Codecov action logs for errors

### CI Failing on PRs

- Ensure all tests pass locally first
- Run `npm run lint -- --fix` to auto-fix lint issues
- Run `npx tsc --noEmit` to check types
- Check for environment-specific issues

## Summary

With these badges and quality gates in place, your repository now has:

- ✅ Visible CI/CD status
- ✅ Automated quality checks on every commit
- ✅ Coverage tracking
- ✅ Professional appearance
- ✅ Clear indication of project health
