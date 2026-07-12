/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// apple-secret-expiry-monitor — unit tests
//
// The monitor decodes the active Apple client secret's exp claim and logs:
//   - an hourly `warn` with a stable message while <30 days remain — this
//     exact string is what the Grafana alert rule matches on, so it must
//     never drift (see observability/grafana/provisioning/alerting/rules.yml)
//   - an `info` breadcrumb when the secret is healthy
//   - a `warn` when the secret cannot be decoded at all
// ---------------------------------------------------------------------------

import { loggers } from '@/lib/utils/logger';

import {
  APPLE_SECRET_EXPIRY_WARNING,
  checkAppleSecretExpiry,
  startAppleSecretExpiryMonitor,
} from './apple-secret-expiry-monitor';

vi.mock('server-only', () => ({}));

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const FIXED_NOW = new Date('2026-07-11T00:00:00.000Z');

/** Builds an unsigned JWT-shaped token whose exp is `days` from FIXED_NOW. */
const tokenExpiringInDays = (days: number): string => {
  const exp = Math.floor((FIXED_NOW.getTime() + days * DAY_MS) / 1000);
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${payload}.signature`;
};

describe('checkAppleSecretExpiry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    warnSpy = vi.spyOn(loggers.auth, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(loggers.auth, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('warns with the alert-rule message when under 30 days remain', () => {
    checkAppleSecretExpiry({ secret: tokenExpiringInDays(10), source: 'static' });

    expect(warnSpy).toHaveBeenCalledWith(
      APPLE_SECRET_EXPIRY_WARNING,
      expect.objectContaining({ daysRemaining: 10, source: 'static' })
    );
  });

  it('includes the ISO expiry date in the warning payload', () => {
    checkAppleSecretExpiry({ secret: tokenExpiringInDays(10), source: 'static' });

    expect(warnSpy).toHaveBeenCalledWith(
      APPLE_SECRET_EXPIRY_WARNING,
      expect.objectContaining({ expiresAt: '2026-07-21T00:00:00.000Z' })
    );
  });

  it('warns with a negative daysRemaining when the secret is already expired', () => {
    checkAppleSecretExpiry({ secret: tokenExpiringInDays(-3), source: 'static' });

    expect(warnSpy).toHaveBeenCalledWith(
      APPLE_SECRET_EXPIRY_WARNING,
      expect.objectContaining({ daysRemaining: -3 })
    );
  });

  it('logs an info breadcrumb when 30 or more days remain', () => {
    checkAppleSecretExpiry({ secret: tokenExpiringInDays(120), source: 'minted' });

    expect(infoSpy).toHaveBeenCalledWith(
      'Apple client secret expiry check',
      expect.objectContaining({ daysRemaining: 120, source: 'minted' })
    );
  });

  it('does not warn when 30 or more days remain', () => {
    checkAppleSecretExpiry({ secret: tokenExpiringInDays(120), source: 'minted' });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the secret is not a decodable JWT', () => {
    checkAppleSecretExpiry({ secret: 'opaque-static-string', source: 'static' });

    expect(warnSpy).toHaveBeenCalledWith(
      'Apple client secret is not a decodable JWT',
      expect.objectContaining({ source: 'static' })
    );
  });
});

describe('startAppleSecretExpiryMonitor', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    warnSpy = vi.spyOn(loggers.auth, 'warn').mockImplementation(() => {});
    vi.spyOn(loggers.auth, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns null and logs nothing when no secret is configured', () => {
    const stop = startAppleSecretExpiryMonitor(null);

    expect(stop).toBeNull();
  });

  it('checks immediately on start', () => {
    const stop = startAppleSecretExpiryMonitor({
      secret: tokenExpiringInDays(5),
      source: 'static',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    stop?.();
  });

  it('re-checks hourly', () => {
    const stop = startAppleSecretExpiryMonitor({
      secret: tokenExpiringInDays(5),
      source: 'static',
    });

    vi.advanceTimersByTime(2 * HOUR_MS);

    expect(warnSpy).toHaveBeenCalledTimes(3);
    stop?.();
  });

  it('stops re-checking after the returned stop function is called', () => {
    const stop = startAppleSecretExpiryMonitor({
      secret: tokenExpiringInDays(5),
      source: 'static',
    });
    stop?.();

    vi.advanceTimersByTime(5 * HOUR_MS);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
