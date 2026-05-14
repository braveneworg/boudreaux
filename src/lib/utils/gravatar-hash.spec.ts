/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { gravatarHash } from './gravatar-hash';

vi.mock('server-only', () => ({}));

describe('gravatarHash', () => {
  it('returns the Gravatar-documented hash for a canonical email', () => {
    // Reference: https://gravatar.com/site/implement/hash/
    expect(gravatarHash('MyEmailAddress@example.com ')).toBe('0bc83cb571cd1c50ba6f3e8a78ef1346');
  });

  it('lowercases the address before hashing', () => {
    expect(gravatarHash('Person@Example.com')).toBe(gravatarHash('person@example.com'));
  });

  it('trims leading and trailing whitespace before hashing', () => {
    expect(gravatarHash('  person@example.com  ')).toBe(gravatarHash('person@example.com'));
  });

  it('produces a 32-character lowercase hex digest', () => {
    expect(gravatarHash('test@example.com')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces distinct hashes for distinct addresses', () => {
    expect(gravatarHash('a@example.com')).not.toBe(gravatarHash('b@example.com'));
  });
});
