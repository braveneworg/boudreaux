/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { gravatarHash } from './gravatar-hash';

vi.mock('server-only', () => ({}));

describe('gravatarHash', () => {
  it('returns the Gravatar-documented SHA-256 hash for a canonical email', () => {
    // Reference: https://docs.gravatar.com/api/avatars/hash/
    expect(gravatarHash('MyEmailAddress@example.com ')).toBe(
      '84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee'
    );
  });

  it('lowercases the address before hashing', () => {
    expect(gravatarHash('Person@Example.com')).toBe(gravatarHash('person@example.com'));
  });

  it('trims leading and trailing whitespace before hashing', () => {
    expect(gravatarHash('  person@example.com  ')).toBe(gravatarHash('person@example.com'));
  });

  it('produces a 64-character lowercase hex digest', () => {
    expect(gravatarHash('test@example.com')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces distinct hashes for distinct addresses', () => {
    expect(gravatarHash('a@example.com')).not.toBe(gravatarHash('b@example.com'));
  });
});
