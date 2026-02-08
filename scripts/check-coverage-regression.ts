#!/usr/bin/env tsx
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

/**
 * Read coverage thresholds from vitest.config.ts to ensure consistency
 * Parses the thresholds block to avoid duplication and drift
 */
function loadThresholdsFromConfig(): CoverageMetrics {
  const configPath = path.join(process.cwd(), 'vitest.config.ts');
  const configContent = fs.readFileSync(configPath, 'utf-8');

  // Parse the thresholds block from the config file in an order-independent way.
  // Supports integer and decimal threshold values, e.g. 95 or 95.5.
  const thresholdsBlockMatch = configContent.match(/thresholds\s*:\s*\{([\s\S]*?)\}/s);

  if (!thresholdsBlockMatch) {
    console.error('❌ Could not find coverage thresholds block in vitest.config.ts');
    process.exit(1);
  }

  const thresholdsBlock = thresholdsBlockMatch[1];
  const metricKeys: (keyof CoverageMetrics)[] = ['lines', 'functions', 'branches', 'statements'];
  const parsedThresholds: Partial<CoverageMetrics> = {};

  for (const key of metricKeys) {
    const keyRegex = new RegExp(`\\b${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)`);
    const match = thresholdsBlock.match(keyRegex);

    if (!match) {
      console.error(
        `❌ Could not parse "${key}" coverage threshold from vitest.config.ts`
      );
      process.exit(1);
    }

    const value = parseFloat(match[1]);

    if (Number.isNaN(value)) {
      console.error(
        `❌ Parsed "${key}" coverage threshold is not a valid number in vitest.config.ts`
      );
      process.exit(1);
    }

    parsedThresholds[key] = value;
  }

  return {
    statements: parsedThresholds.statements as number,
    branches: parsedThresholds.branches as number,
    functions: parsedThresholds.functions as number,
    lines: parsedThresholds.lines as number,
  };
}

const THRESHOLDS: CoverageMetrics = loadThresholdsFromConfig();

// Allowed tolerance: permit up to 2% decrease as long as thresholds are met
const ALLOWED_DECREASE_TOLERANCE = 2;

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
  const toleratedDecreases: string[] = [];

  console.info('\n📊 Coverage Comparison\n');
  console.info('| Metric     | Baseline | Current  | Change   | Status |');
  console.info('|------------|----------|----------|----------|--------|');

  const metricNames: (keyof CoverageMetrics)[] = ['statements', 'branches', 'functions', 'lines'];

  for (const metric of metricNames) {
    const baselineValue = baseline[metric];
    const currentValue = current[metric];
    const threshold = THRESHOLDS[metric];
    const diff = currentValue - baselineValue;
    const diffStr = diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
    const arrowStatus = diff < 0 ? '⬇️' : diff > 0 ? '⬆️' : '➡️';

    let status: string;

    if (currentValue < baselineValue) {
      const decrease = baselineValue - currentValue;

      // Check if decrease is within tolerance AND still above threshold
      if (decrease <= ALLOWED_DECREASE_TOLERANCE && currentValue >= threshold) {
        status = '⚠️ OK';
        toleratedDecreases.push(
          `${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${baselineValue.toFixed(2)}% → ${currentValue.toFixed(2)}% (${diff.toFixed(2)}%, within tolerance)`
        );
      } else if (currentValue < threshold) {
        status = '❌ FAIL';
        regressions.push(
          `${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${baselineValue.toFixed(2)}% → ${currentValue.toFixed(2)}% (${diff.toFixed(2)}%, below threshold of ${threshold}%)`
        );
      } else {
        status = '❌ FAIL';
        regressions.push(
          `${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${baselineValue.toFixed(2)}% → ${currentValue.toFixed(2)}% (${diff.toFixed(2)}%, exceeds ${ALLOWED_DECREASE_TOLERANCE}% tolerance)`
        );
      }
    } else {
      status = '✅';
    }

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
  console.info(`📝 Updated COVERAGE_METRICS.md with new baseline (${today})\n`);
}

/**
 * Main execution
 */
function main(): void {
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
}

main();
