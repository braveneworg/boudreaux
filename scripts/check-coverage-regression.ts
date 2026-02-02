#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Coverage Regression Check Script
 *
 * This script compares the current test coverage metrics against the baseline
 * stored in COVERAGE_METRICS.md and fails if any metric has decreased.
 *
 * Usage: npx tsx scripts/check-coverage-regression.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface CoverageMetrics {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

const METRICS_FILE = path.join(process.cwd(), 'COVERAGE_METRICS.md');
const COVERAGE_SUMMARY_FILE = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

/**
 * Parse the baseline metrics from COVERAGE_METRICS.md
 */
function parseBaselineMetrics(): CoverageMetrics {
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
  const metrics: Partial<CoverageMetrics> = {};

  let match;
  while ((match = metricsRegex.exec(content)) !== null) {
    const metricName = match[1].toLowerCase() as keyof CoverageMetrics;
    const value = parseFloat(match[2]);
    metrics[metricName] = value;
  }

  if (
    metrics.statements === undefined ||
    metrics.branches === undefined ||
    metrics.functions === undefined ||
    metrics.lines === undefined
  ) {
    console.error('❌ Could not parse all metrics from COVERAGE_METRICS.md');
    console.error('Found:', metrics);
    process.exit(1);
  }

  return metrics as CoverageMetrics;
}

/**
 * Parse the current coverage from coverage-summary.json
 */
function parseCurrentCoverage(): CoverageMetrics {
  if (!fs.existsSync(COVERAGE_SUMMARY_FILE)) {
    console.error('❌ coverage/coverage-summary.json not found.');
    console.error('Please run: npm run test:coverage');
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
}

/**
 * Compare metrics and report any regressions
 */
function checkForRegressions(baseline: CoverageMetrics, current: CoverageMetrics): boolean {
  const regressions: string[] = [];

  console.log('\n📊 Coverage Comparison\n');
  console.log('| Metric     | Baseline | Current  | Change   |');
  console.log('|------------|----------|----------|----------|');

  const metricNames: (keyof CoverageMetrics)[] = ['statements', 'branches', 'functions', 'lines'];

  for (const metric of metricNames) {
    const baselineValue = baseline[metric];
    const currentValue = current[metric];
    const diff = currentValue - baselineValue;
    const diffStr = diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
    const status = diff < 0 ? '⬇️' : diff > 0 ? '⬆️' : '➡️';

    const metricDisplay = metric.charAt(0).toUpperCase() + metric.slice(1);
    console.log(
      `| ${metricDisplay.padEnd(10)} | ${baselineValue.toFixed(2).padStart(6)}%  | ${currentValue.toFixed(2).padStart(6)}%  | ${status} ${diffStr.padStart(6)} |`
    );

    if (currentValue < baselineValue) {
      regressions.push(
        `${metricDisplay}: ${baselineValue.toFixed(2)}% → ${currentValue.toFixed(2)}% (${diff.toFixed(2)}%)`
      );
    }
  }

  console.log('');

  if (regressions.length > 0) {
    console.error('❌ Coverage regression detected!\n');
    console.error('The following metrics have decreased:\n');
    regressions.forEach((r) => console.error(`  • ${r}`));
    console.error('\nPlease add tests to maintain or improve coverage before merging.');
    console.error(
      'If the decrease is intentional, update COVERAGE_METRICS.md with the new baseline.\n'
    );
    return false;
  }

  console.log('✅ No coverage regression detected!\n');
  return true;
}

/**
 * Update COVERAGE_METRICS.md with new values if coverage improved
 */
function updateMetricsFile(current: CoverageMetrics): void {
  const content = fs.readFileSync(METRICS_FILE, 'utf-8');
  const today = new Date().toISOString().split('T')[0];

  // Update the current coverage summary table
  let updatedContent = content
    .replace(/(\|\s*Statements\s*\|\s*)\d+\.?\d*%/, `$1${current.statements.toFixed(2)}%`)
    .replace(/(\|\s*Branches\s*\|\s*)\d+\.?\d*%/, `$1${current.branches.toFixed(2)}%`)
    .replace(/(\|\s*Functions\s*\|\s*)\d+\.?\d*%/, `$1${current.functions.toFixed(2)}%`)
    .replace(/(\|\s*Lines\s*\|\s*)\d+\.?\d*%/, `$1${current.lines.toFixed(2)}%`);

  // Update the last updated date
  updatedContent = updatedContent.replace(
    /\*\*Last Updated:\*\*\s*\w+\s+\d+,\s+\d+/,
    `**Last Updated:** ${today}`
  );

  fs.writeFileSync(METRICS_FILE, updatedContent);
  console.log(`📝 Updated COVERAGE_METRICS.md with new baseline (${today})\n`);
}

/**
 * Main execution
 */
function main(): void {
  console.log('🔍 Checking for coverage regression...\n');

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
}

main();
