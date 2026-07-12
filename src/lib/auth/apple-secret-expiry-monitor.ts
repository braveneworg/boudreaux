/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';

import { decodeJwtExpiry } from './jwt-expiry';

/**
 * Log message matched verbatim by the `apple-secret-expiry` Grafana alert
 * rule (observability/grafana/provisioning/alerting/rules.yml). Changing this
 * string silently disarms the alert — update the rule in lockstep.
 */
export const APPLE_SECRET_EXPIRY_WARNING = 'Apple client secret expiring soon';

const WARNING_THRESHOLD_DAYS = 30;
const CHECK_INTERVAL_MS = 3_600_000; // hourly — keeps the alert window fresh
const MS_PER_DAY = 86_400_000;

export interface AppleSecretDescriptor {
  /** The active Apple OAuth client secret (a JWT). */
  secret: string;
  /** Whether the secret was minted at boot or supplied via APPLE_CLIENT_SECRET. */
  source: 'minted' | 'static';
}

/**
 * Decodes the active Apple client secret's expiry and logs one line:
 * a `warn` (the Grafana-matched message) when under 30 days remain or the
 * secret is undecodable, otherwise an `info` breadcrumb.
 */
export const checkAppleSecretExpiry = ({ secret, source }: AppleSecretDescriptor): void => {
  const expiresAt = decodeJwtExpiry(secret);
  if (expiresAt === null) {
    loggers.auth.warn('Apple client secret is not a decodable JWT', { source });
    return;
  }
  const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / MS_PER_DAY);
  const details = { daysRemaining, expiresAt: expiresAt.toISOString(), source };
  if (daysRemaining < WARNING_THRESHOLD_DAYS) {
    loggers.auth.warn(APPLE_SECRET_EXPIRY_WARNING, details);
    return;
  }
  loggers.auth.info('Apple client secret expiry check', details);
};

/**
 * Starts the expiry monitor: one immediate check, then hourly re-checks so
 * the Loki-backed alert rule always has a recent sample to count. The
 * interval is unref'd — it never keeps a process (build, script) alive.
 *
 * @returns A stop function, or `null` when no Apple secret is configured.
 */
export const startAppleSecretExpiryMonitor = (
  descriptor: AppleSecretDescriptor | null
): (() => void) | null => {
  if (descriptor === null) {
    return null;
  }
  checkAppleSecretExpiry(descriptor);
  const interval: NodeJS.Timeout = setInterval(
    () => checkAppleSecretExpiry(descriptor),
    CHECK_INTERVAL_MS
  );
  interval.unref();
  return () => clearInterval(interval);
};
