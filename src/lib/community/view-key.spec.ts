/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createHmac } from 'node:crypto';

import { guestAddressKey, resolveViewKeySecret, viewKeyFor, type ViewKeyInput } from './view-key';

vi.mock('server-only', () => ({}));

const SUBMISSION_ID = 'c'.repeat(24);
const OTHER_SUBMISSION_ID = 'd'.repeat(24);
const USER_ID = 'a'.repeat(24);
const DAY = '2026-11-14';
// Clearly fake, and as long as the real secret's floor.
const SECRET = 'view-key-spec-secret-not-a-secret-000000';
const OTHER_SECRET = 'view-key-spec-other-not-a-secret-0000000';

const user = { kind: 'user', id: USER_ID } as const;
const guest = { kind: 'guest', id: '0b0f6d0e-8c0f-4d0f-9d0f-0d0f0d0f0d0f' } as const;

const keyOf = (overrides: Partial<ViewKeyInput> = {}): string =>
  viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY, secret: SECRET, ...overrides });

describe('viewKeyFor', () => {
  it('is an HMAC-SHA-256, under the secret, of the submission, the viewer and the day', () => {
    expect(keyOf()).toBe(
      createHmac('sha256', SECRET)
        .update(`submission-view|${SUBMISSION_ID}|user:${USER_ID}|${DAY}`)
        .digest('hex')
    );
  });

  it('is the same for the same submission, viewer, day and secret', () => {
    expect(keyOf({ viewer: guest })).toBe(keyOf({ viewer: guest }));
  });

  it('differs for another submission', () => {
    expect(keyOf({ submissionId: OTHER_SUBMISSION_ID })).not.toBe(keyOf());
  });

  it('differs for another day', () => {
    expect(keyOf({ day: '2026-11-15' })).not.toBe(keyOf());
  });

  it('differs for another viewer', () => {
    expect(keyOf({ viewer: guest })).not.toBe(keyOf());
  });

  it('tells a guest from an account that holds the same id', () => {
    expect(keyOf({ viewer: { kind: 'guest', id: USER_ID } })).not.toBe(keyOf());
  });

  it('cannot be computed without the secret: another secret gives another key', () => {
    expect(keyOf({ secret: OTHER_SECRET })).not.toBe(keyOf());
  });

  it('does not contain the viewer’s id', () => {
    expect(keyOf()).not.toContain(USER_ID);
  });
});

describe('resolveViewKeySecret', () => {
  it('is the server’s signing secret', () => {
    vi.stubEnv('AUTH_SECRET', SECRET);

    expect(resolveViewKeySecret()).toBe(SECRET);
  });

  it('throws when there is none, so a view is never stored under an unkeyed hash', () => {
    vi.stubEnv('AUTH_SECRET', '');

    expect(() => resolveViewKeySecret()).toThrow('AUTH_SECRET');
  });
});

describe('guestAddressKey', () => {
  it('is an IPv4 address whole', () => {
    expect(guestAddressKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('is an IPv4-mapped address as its IPv4 address', () => {
    expect(guestAddressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('is the /64 of an IPv6 address, so one network is one address', () => {
    expect(guestAddressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(
      guestAddressKey('2001:db8:1:2::1')
    );
  });

  it('tells two IPv6 networks apart', () => {
    expect(guestAddressKey('2001:db8:1:3::1')).not.toBe(guestAddressKey('2001:db8:1:2::1'));
  });

  it('keeps a value that is not an address as it is', () => {
    expect(guestAddressKey('anonymous')).toBe('anonymous');
  });
});
