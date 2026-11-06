/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createLogger } from '@/lib/utils/logger';

import {
  ENV_MANIFEST,
  FEATURE_GROUPS,
  evaluateFeatureGroup,
  featureGroupMembers,
  presentEnvNames,
  type FeatureGroupStatus,
} from './env-manifest';

/**
 * The boot check: run once from `instrumentation.ts` `register()` before the
 * server takes a request, derived entirely from the manifest.
 *
 * - A missing required runtime value fails boot in production (Next.js exits
 *   when `register()` throws) and is logged as an error elsewhere.
 * - A half-set feature group is logged as one error; the feature stays off
 *   and the server still boots.
 * - Each disabled feature group gets one warning line.
 *
 * Only names are ever logged, never values.
 */

const MIN_SECRET_LENGTH = 32;
const STRENGTH_CHECKED_SECRETS = ['AUTH_SECRET', 'JOB_CALLBACK_SECRET'] as const;

/** The slice of the project `Logger` the check uses (`error` takes an error before its data). */
export interface BootCheckLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: unknown, data?: Record<string, unknown>) => void;
}

export interface BootCheckOptions {
  env: Readonly<Record<string, string | undefined>>;
  logger: BootCheckLogger;
  isProduction: boolean;
}

export interface BootCheckReport {
  /** SKIP_ENV_VALIDATION was set: required values and secret strength were not checked. */
  skipped: boolean;
  missingRequired: string[];
  weakSecrets: string[];
  groups: FeatureGroupStatus[];
}

const REQUIRED_RUNTIME_NAMES = ENV_MANIFEST.filter(
  ({ phase, requirement }) => phase === 'runtime' && requirement === 'required'
).map(({ name }) => name);

const weakSecretsIn = (env: BootCheckOptions['env']): string[] =>
  STRENGTH_CHECKED_SECRETS.filter((name) => {
    const value = new Map(Object.entries(env)).get(name)?.trim();
    return value !== undefined && value !== '' && value.length < MIN_SECRET_LENGTH;
  });

const problemsMessage = (missingRequired: string[], weakSecrets: string[]): string =>
  [
    missingRequired.length > 0
      ? `Missing required environment variables: ${missingRequired.join(', ')}`
      : '',
    ...weakSecrets.map((name) => `${name} must be at least ${MIN_SECRET_LENGTH} characters`),
  ]
    .filter((line) => line !== '')
    .join('\n');

const logFeatureGroups = (groups: FeatureGroupStatus[], logger: BootCheckLogger): void => {
  for (const { id, feature, state, missing } of groups) {
    if (state === 'half-set') {
      logger.error(
        `Feature disabled by incomplete config: ${feature}. Set ${missing.join(', ')}, or clear the other ${id} values.`,
        undefined,
        { featureGroup: id, missing }
      );
    } else if (state === 'disabled') {
      const group = FEATURE_GROUPS.find((candidate) => candidate.id === id);
      const members = group ? featureGroupMembers(group) : missing;
      logger.warn(`Feature disabled: ${feature} (${members.join(', ')} not set)`, {
        featureGroup: id,
      });
    }
  }
};

/**
 * Check the environment against the manifest. Throws in production when a
 * required value is missing or a secret is too short; otherwise only logs.
 */
export const checkRuntimeConfig = ({
  env,
  logger,
  isProduction,
}: BootCheckOptions): BootCheckReport => {
  const present = presentEnvNames(env);
  const skipped = env.SKIP_ENV_VALIDATION === 'true';
  const groups = FEATURE_GROUPS.map((group) => evaluateFeatureGroup(group, present));

  if (skipped) {
    const reason =
      env.NEXT_PHASE === 'phase-production-build' ? 'build phase' : 'SKIP_ENV_VALIDATION';
    logger.warn(`Runtime config check skipped (${reason})`);
    logFeatureGroups(groups, logger);
    return { skipped, missingRequired: [], weakSecrets: [], groups };
  }

  const missingRequired = REQUIRED_RUNTIME_NAMES.filter((name) => !present.has(name));
  const weakSecrets = weakSecretsIn(env);

  if (env.DATABASE_URL && !env.DATABASE_URL.startsWith('mongodb')) {
    logger.warn('DATABASE_URL does not look like a MongoDB connection string');
  }

  logFeatureGroups(groups, logger);

  if (missingRequired.length > 0 || weakSecrets.length > 0) {
    const message = problemsMessage(missingRequired, weakSecrets);
    if (isProduction) {
      throw new Error(message);
    }
    logger.error(message, undefined, { missingRequired, weakSecrets });
    return { skipped, missingRequired, weakSecrets, groups };
  }

  logger.info('Runtime config check passed', {
    enabledFeatures: groups.filter(({ state }) => state === 'enabled').map(({ id }) => id),
  });
  return { skipped, missingRequired, weakSecrets, groups };
};

/** `register()`'s entry point: check `process.env` with the CONFIG logger. */
export const runBootCheck = (): BootCheckReport =>
  checkRuntimeConfig({
    env: process.env,
    logger: createLogger('CONFIG'),
    isProduction: process.env.NODE_ENV === 'production',
  });
