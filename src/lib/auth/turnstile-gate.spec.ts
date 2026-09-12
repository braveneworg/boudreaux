/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  TURNSTILE_GATE_COOKIE,
  TURNSTILE_GATE_MAX_AGE_SECONDS,
  createTurnstileGateValue,
  isValidTurnstileGateValue,
  setTurnstileGateCookie,
} from './turnstile-gate';

vi.mock('server-only', () => ({}));

const mockSet = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: mockSet })),
}));

// Clearly-fake signing secrets, ≥32 chars like the real AUTH_SECRET floor.
const SECRET = `gate-secret-${'a'.repeat(32)}`;
const OTHER_SECRET = `gate-secret-${'b'.repeat(32)}`;
const NOW = Date.parse('2026-09-12T12:00:00.000Z');
const MAX_AGE_MS = TURNSTILE_GATE_MAX_AGE_SECONDS * 1000;

describe('turnstile gate value', () => {
  it('accepts a value it just issued', () => {
    const value = createTurnstileGateValue({ now: NOW, secret: SECRET });

    expect(isValidTurnstileGateValue({ value, now: NOW + 1_000, secret: SECRET })).toBe(true);
  });

  it('rejects a value signed with another secret', () => {
    const value = createTurnstileGateValue({ now: NOW, secret: OTHER_SECRET });

    expect(isValidTurnstileGateValue({ value, now: NOW, secret: SECRET })).toBe(false);
  });

  it('rejects a tampered issue time', () => {
    const value = createTurnstileGateValue({ now: NOW, secret: SECRET });
    const [, signature] = value.split('.');
    const tampered = `${NOW + 60_000}.${signature}`;

    expect(isValidTurnstileGateValue({ value: tampered, now: NOW, secret: SECRET })).toBe(false);
  });

  it('rejects a value older than the max age', () => {
    const value = createTurnstileGateValue({ now: NOW, secret: SECRET });

    expect(isValidTurnstileGateValue({ value, now: NOW + MAX_AGE_MS + 1, secret: SECRET })).toBe(
      false
    );
  });

  it('accepts a value exactly at the max age', () => {
    const value = createTurnstileGateValue({ now: NOW, secret: SECRET });

    expect(isValidTurnstileGateValue({ value, now: NOW + MAX_AGE_MS, secret: SECRET })).toBe(true);
  });

  it('rejects a value issued in the future', () => {
    const value = createTurnstileGateValue({ now: NOW + 5_000, secret: SECRET });

    expect(isValidTurnstileGateValue({ value, now: NOW, secret: SECRET })).toBe(false);
  });

  it.each(['', 'no-dot', 'a.b.c', '123.', '.sig', 'not-a-number.sig'])(
    'rejects the malformed value %j',
    (value) => {
      expect(isValidTurnstileGateValue({ value, now: NOW, secret: SECRET })).toBe(false);
    }
  );
});

describe('setTurnstileGateCookie', () => {
  beforeEach(() => {
    mockSet.mockClear();
    vi.stubEnv('AUTH_SECRET', SECRET);
  });

  it('writes an httpOnly, lax, site-wide cookie under the gate name', async () => {
    await setTurnstileGateCookie();

    const [name, , options] = mockSet.mock.calls[0];
    expect(name).toBe(TURNSTILE_GATE_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TURNSTILE_GATE_MAX_AGE_SECONDS,
    });
  });

  it('writes a value that verifies against AUTH_SECRET', async () => {
    await setTurnstileGateCookie();

    const [, value] = mockSet.mock.calls[0];
    expect(isValidTurnstileGateValue({ value, now: Date.now(), secret: SECRET })).toBe(true);
  });

  it('throws instead of issuing an unsigned cookie when AUTH_SECRET is missing', async () => {
    vi.stubEnv('AUTH_SECRET', '');

    await expect(setTurnstileGateCookie()).rejects.toThrow('AUTH_SECRET');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
