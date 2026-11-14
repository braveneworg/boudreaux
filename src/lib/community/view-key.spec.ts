/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createHash } from 'node:crypto';

import { guestAddressKey, viewKeyFor } from './view-key';

vi.mock('server-only', () => ({}));

const SUBMISSION_ID = 'c'.repeat(24);
const OTHER_SUBMISSION_ID = 'd'.repeat(24);
const USER_ID = 'a'.repeat(24);
const DAY = '2026-11-14';

const user = { kind: 'user', id: USER_ID } as const;
const guest = { kind: 'guest', id: '0b0f6d0e-8c0f-4d0f-9d0f-0d0f0d0f0d0f' } as const;

describe('viewKeyFor', () => {
  it('is the SHA-256 of the submission, the viewer and the day', () => {
    expect(viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY })).toBe(
      createHash('sha256').update(`${SUBMISSION_ID}|user:${USER_ID}|${DAY}`).digest('hex')
    );
  });

  it('is the same for the same submission, viewer and day', () => {
    const first = viewKeyFor({ submissionId: SUBMISSION_ID, viewer: guest, day: DAY });

    expect(viewKeyFor({ submissionId: SUBMISSION_ID, viewer: guest, day: DAY })).toBe(first);
  });

  it('differs for another submission', () => {
    expect(viewKeyFor({ submissionId: OTHER_SUBMISSION_ID, viewer: user, day: DAY })).not.toBe(
      viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY })
    );
  });

  it('differs for another day', () => {
    expect(viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: '2026-11-15' })).not.toBe(
      viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY })
    );
  });

  it('differs for another viewer', () => {
    expect(viewKeyFor({ submissionId: SUBMISSION_ID, viewer: guest, day: DAY })).not.toBe(
      viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY })
    );
  });

  it('tells a guest from an account that holds the same id', () => {
    expect(
      viewKeyFor({ submissionId: SUBMISSION_ID, viewer: { kind: 'guest', id: USER_ID }, day: DAY })
    ).not.toBe(viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY }));
  });

  it('does not contain the viewer’s id', () => {
    expect(viewKeyFor({ submissionId: SUBMISSION_ID, viewer: user, day: DAY })).not.toContain(
      USER_ID
    );
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
