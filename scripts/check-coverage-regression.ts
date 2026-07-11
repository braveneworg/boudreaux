#!/usr/bin/env tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Coverage Regression Check Script
 *
 * This script compares the current test coverage metrics against the baseline
 * stored in COVERAGE_METRICS.md and fails if any metric has decreased beyond
 * acceptable limits.
 *
 * Tolerance Policy:
 * - Allows up to 2% decrease in any metric
 * - ONLY if the metric remains above the configured threshold
 * - Thresholds: statements: 95%, branches: 85%, functions: 95%, lines: 95%
 *
 * Examples:
 * - Statement coverage: 97% → 95.5% ✅ (within 2% tolerance, above 95% threshold)
 * - Statement coverage: 97% → 94.5% ❌ (within 2% tolerance, but below 95% threshold)
 * - Statement coverage: 97% → 94% ❌ (exceeds 2% tolerance)
 *
 * Usage: pnpm exec tsx scripts/check-coverage-regression.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CoverageMetrics {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

/**
 * Read coverage thresholds from vitest.config.ts to ensure consistency
 * Parses the thresholds block to avoid duplication and drift
 */
const loadThresholdsFromConfig = (): CoverageMetrics => {
  const configPath = path.join(process.cwd(), 'vitest.config.ts');

  if (!fs.existsSync(configPath)) {
    console.error('❌ vitest.config.ts not found. Please ensure it exists at the project root.');
    process.exit(1);
  }

  let configContent: string;
  try {
    configContent = fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    console.error(
      '❌ Failed to read vitest.config.ts. Please check file permissions and try again.'
    );
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
  // Parse the thresholds block from the config file in an order-independent way.
  // Supports integer and decimal threshold values, e.g. 95 or 95.5.
  const thresholdsBlockMatch = configContent.match(/thresholds\s*:\s*\{([\s\S]*?)\}/);

  if (!thresholdsBlockMatch) {
    console.error('❌ Could not find coverage thresholds block in vitest.config.ts');
    process.exit(1);
  }

  const thresholdsBlock = thresholdsBlockMatch[1];
  // Static per-metric regexes (literals) keyed by metric name. Equivalent to the
  // previously dynamic `new RegExp(\`\\b${key}\\s*:...\`)` but without a non-literal RegExp.
  const metricRegexes = new Map<keyof CoverageMetrics, RegExp>([
    ['lines', /\blines\s*:\s*(\d+\.?\d*)/],
    ['functions', /\bfunctions\s*:\s*(\d+\.?\d*)/],
    ['branches', /\bbranches\s*:\s*(\d+\.?\d*)/],
    ['statements', /\bstatements\s*:\s*(\d+\.?\d*)/],
  ]);
  const parsedThresholds = new Map<keyof CoverageMetrics, number>();

  for (const [key, keyRegex] of metricRegexes) {
    const match = thresholdsBlock.match(keyRegex);

    if (!match) {
      console.error(`❌ Could not parse "${key}" coverage threshold from vitest.config.ts`);
      process.exit(1);
    }

    const value = parseFloat(match[1]);

    if (Number.isNaN(value)) {
      console.error(
        `❌ Parsed "${key}" coverage threshold is not a valid number in vitest.config.ts`
      );
      process.exit(1);
    }

    parsedThresholds.set(key, value);
  }

  const readMetric = (key: keyof CoverageMetrics): number => {
    const value = parsedThresholds.get(key);
    if (value === undefined) {
      console.error(`❌ Missing "${key}" coverage threshold in vitest.config.ts`);
      process.exit(1);
    }
    return value;
  };

  return {
    statements: readMetric('statements'),
    branches: readMetric('branches'),
    functions: readMetric('functions'),
    lines: readMetric('lines'),
  };
};

const THRESHOLDS: CoverageMetrics = loadThresholdsFromConfig();

// Allowed tolerance: permit up to 2% decrease as long as thresholds are met
const ALLOWED_DECREASE_TOLERANCE = 2;

const METRICS_FILE = path.join(process.cwd(), 'COVERAGE_METRICS.md');
const COVERAGE_SUMMARY_FILE = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

/**
 * Parse the baseline metrics from COVERAGE_METRICS.md
 */
const parseBaselineMetrics = (): CoverageMetrics => {
  if (!fs.existsSync(METRICS_FILE)) {
    console.error(
      '❌ COVERAGE_METRICS.md not found. Please run tests first to establish a baseline.'
    );
    process.exit(1);
  }

  const content = fs.readFileSync(METRICS_FILE, 'utf-8');

  // Parse the current coverage summary table
  // Format: | Statements | 98.47%   |
  const metricsRegex = /\|\s*(Statements|Branches|Functions|Lines)\s*\|\s*(\d+\.?\d*)%\s*\|/gi;
  const metrics = new Map<keyof CoverageMetrics, number>();

  let match;
  while ((match = metricsRegex.exec(content)) !== null) {
    const metricName = match[1].toLowerCase() as keyof CoverageMetrics;
    const value = parseFloat(match[2]);
    metrics.set(metricName, value);
  }

  const statements = metrics.get('statements');
  const branches = metrics.get('branches');
  const functions = metrics.get('functions');
  const lines = metrics.get('lines');

  if (
    statements === undefined ||
    branches === undefined ||
    functions === undefined ||
    lines === undefined
  ) {
    console.error('❌ Could not parse all metrics from COVERAGE_METRICS.md');
    console.error('Found:', Object.fromEntries(metrics));
    process.exit(1);
  }

  return { statements, branches, functions, lines };
};

/**
 * Parse the current coverage from coverage-summary.json
 */
const parseCurrentCoverage = (): CoverageMetrics => {
  if (!fs.existsSync(COVERAGE_SUMMARY_FILE)) {
    console.error('❌ coverage/coverage-summary.json not found.');
    console.error('Please run: pnpm run test:coverage');
    process.exit(1);
  }

  const content = fs.readFileSync(COVERAGE_SUMMARY_FILE, 'utf-8');
  const summary = JSON.parse(content);

  const total = summary.total;
  if (!total) {
    console.error('❌ No total coverage found in coverage-summary.json');
    process.exit(1);
  }

  return {
    statements: total.statements.pct,
    branches: total.branches.pct,
    functions: total.functions.pct,
    lines: total.lines.pct,
  };
};

// Literal property access for a fixed-shape metric, avoiding computed key indexing.
const readMetric = (source: CoverageMetrics, metric: keyof CoverageMetrics): number => {
  switch (metric) {
    case 'statements':
      return source.statements;
    case 'branches':
      return source.branches;
    case 'functions':
      return source.functions;
    case 'lines':
      return source.lines;
  }
};

/** The classification of a single metric's baseline→current change. */
interface MetricEvaluation {
  /** Status cell rendered in the comparison table. */
  status: string;
  /** A regression message, when the change is a hard failure. */
  regression?: string;
  /** A tolerated-decrease message, when the change is within tolerance. */
  toleratedDecrease?: string;
}

/**
 * Classify one metric's change into a table status plus, where relevant, a
 * regression or tolerated-decrease message. Extracted from checkForRegressions
 * to keep that function's cyclomatic complexity within limits; behavior is
 * identical to the previous inline if/else-if/else.
 */
const evaluateMetric = (
  metric: keyof CoverageMetrics,
  baselineValue: number,
  currentValue: number,
  threshold: number
): MetricEvaluation => {
  if (currentValue >= baselineValue) {
    return { status: '✅' };
  }

  const diff = currentValue - baselineValue;
  const label = metric.charAt(0).toUpperCase() + metric.slice(1);
  const change = `${baselineValue.toFixed(2)}% → ${currentValue.toFixed(2)}% (${diff.toFixed(2)}%`;
  const decrease = baselineValue - currentValue;

  // Within tolerance AND still above threshold → tolerated.
  if (decrease <= ALLOWED_DECREASE_TOLERANCE && currentValue >= threshold) {
    return {
      status: '⚠️ OK',
      toleratedDecrease: `${label}: ${change}, within tolerance)`,
    };
  }

  if (currentValue < threshold) {
    return {
      status: '❌ FAIL',
      regression: `${label}: ${change}, below threshold of ${threshold}%)`,
    };
  }

  return {
    status: '❌ FAIL',
    regression: `${label}: ${change}, exceeds ${ALLOWED_DECREASE_TOLERANCE}% tolerance)`,
  };
};

/**
 * Compare metrics and report any regressions
 */
const checkForRegressions = (baseline: CoverageMetrics, current: CoverageMetrics): boolean => {
  const regressions: string[] = [];
  const toleratedDecreases: string[] = [];

  console.info('\n📊 Coverage Comparison\n');
  console.info('| Metric     | Baseline | Current  | Change   | Status |');
  console.info('|------------|----------|----------|----------|--------|');

  const metricNames: (keyof CoverageMetrics)[] = ['statements', 'branches', 'functions', 'lines'];

  for (const metric of metricNames) {
    const baselineValue = readMetric(baseline, metric);
    const currentValue = readMetric(current, metric);
    const threshold = readMetric(THRESHOLDS, metric);
    const diff = currentValue - baselineValue;
    const diffStr = diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
    const arrowStatus = diff < 0 ? '⬇️' : diff > 0 ? '⬆️' : '➡️';

    const { status, regression, toleratedDecrease } = evaluateMetric(
      metric,
      baselineValue,
      currentValue,
      threshold
    );
    if (regression) regressions.push(regression);
    if (toleratedDecrease) toleratedDecreases.push(toleratedDecrease);

    const metricDisplay = metric.charAt(0).toUpperCase() + metric.slice(1);
    console.info(
      `| ${metricDisplay.padEnd(10)} | ${baselineValue.toFixed(2).padStart(6)}%  | ${currentValue.toFixed(2).padStart(6)}%  | ${arrowStatus} ${diffStr.padStart(6)} | ${status.padEnd(6)} |`
    );
  }

  console.info('');

  if (toleratedDecreases.length > 0) {
    console.warn('⚠️  Coverage decreased within acceptable tolerance:\n');
    toleratedDecreases.forEach((d) => console.warn(`  • ${d}`));
    console.warn(
      `\nNote: Up to ${ALLOWED_DECREASE_TOLERANCE}% decrease is permitted as long as thresholds are met.\n`
    );
  }

  if (regressions.length > 0) {
    console.error('❌ Coverage regression detected!\n');
    console.error('The following metrics have decreased beyond acceptable limits:\n');
    regressions.forEach((r) => console.error(`  • ${r}`));
    console.error('\nPlease add tests to maintain or improve coverage before merging.');
    console.error(
      'If the decrease is intentional, update COVERAGE_METRICS.md with the new baseline.\n'
    );
    return false;
  }

  if (toleratedDecreases.length === 0) {
    console.info('✅ No coverage regression detected!\n');
  } else {
    console.info(
      '✅ Coverage changes are within acceptable limits (no regressions beyond tolerance)!\n'
    );
  }
  return true;
};

/**
 * Rewrite the Current Coverage Summary percentages and the Last Updated date
 * in the metrics file content. Pure — exported for tests. Only the first
 * occurrence of each metric row is replaced, which is the summary table;
 * Coverage History rows are never touched (their cells don't follow a metric
 * label).
 */
export const refreshMetricsContent = (
  content: string,
  current: CoverageMetrics,
  today: string
): string =>
  content
    .replace(/(\|\s*Statements\s*\|\s*)\d+\.?\d*%/, `$1${current.statements.toFixed(2)}%`)
    .replace(/(\|\s*Branches\s*\|\s*)\d+\.?\d*%/, `$1${current.branches.toFixed(2)}%`)
    .replace(/(\|\s*Functions\s*\|\s*)\d+\.?\d*%/, `$1${current.functions.toFixed(2)}%`)
    .replace(/(\|\s*Lines\s*\|\s*)\d+\.?\d*%/, `$1${current.lines.toFixed(2)}%`)
    // Match the whole rest of the line — the file carries ISO dates, and the
    // previous "July 4, 2026"-style pattern silently skipped them, leaving
    // stale dates behind refreshed percentages.
    .replace(/\*\*Last Updated:\*\*.*$/m, `**Last Updated:** ${today}`);

/**
 * Update COVERAGE_METRICS.md with new values if coverage improved
 */
const updateMetricsFile = (current: CoverageMetrics): void => {
  const content = fs.readFileSync(METRICS_FILE, 'utf-8');
  const today = new Date().toISOString().split('T')[0];

  fs.writeFileSync(METRICS_FILE, refreshMetricsContent(content, current, today));
  console.info(`📝 Updated COVERAGE_METRICS.md with new baseline (${today})\n`);
};

/**
 * Main execution
 */
const main = (): void => {
  console.info('🔍 Checking for coverage regression...\n');

  const baseline = parseBaselineMetrics();
  const current = parseCurrentCoverage();

  const passed = checkForRegressions(baseline, current);

  // If coverage improved, update the metrics file
  const hasImprovement =
    current.statements > baseline.statements ||
    current.branches > baseline.branches ||
    current.functions > baseline.functions ||
    current.lines > baseline.lines;

  if (passed && hasImprovement) {
    updateMetricsFile(current);
  }

  process.exit(passed ? 0 : 1);
};

// True when this file is executed directly, not imported (ESM-safe require.main === module)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
