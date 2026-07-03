/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isInternalBioUrl } from './is-internal-url';

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://example.com',
}));

describe('isInternalBioUrl', () => {
  it('returns true for a site-relative path', () => {
    expect(isInternalBioUrl('/releases/r1')).toBe(true);
  });

  it('returns true for a root-relative path', () => {
    expect(isInternalBioUrl('/artists/ceschi')).toBe(true);
  });

  it('returns false for a protocol-relative URL starting with //', () => {
    expect(isInternalBioUrl('//example.com/path')).toBe(false);
  });

  it('returns false for an external http URL with a foreign host', () => {
    expect(isInternalBioUrl('https://en.wikipedia.org/wiki/Ceschi')).toBe(false);
  });

  it('returns true for an absolute URL whose hostname matches the app origin', () => {
    expect(isInternalBioUrl('https://example.com/releases/r1')).toBe(true);
  });

  it('returns true for a www-prefixed absolute URL matching the app origin', () => {
    expect(isInternalBioUrl('https://www.example.com/releases/r1')).toBe(true);
  });

  it('returns false for a malformed URL', () => {
    expect(isInternalBioUrl('not-a-url')).toBe(false);
  });

  it('treats an own-host non-http scheme as external', () => {
    expect(isInternalBioUrl('ftp://example.com/x')).toBe(false);
  });
});
