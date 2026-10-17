/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { releaseDeepLinkHref, releaseDeepLinkUrl } from './release-deep-link';

const RELEASE_ID = '0123456789abcdef01234567';

describe('releaseDeepLinkHref', () => {
  it("links to the artist's releases listing with the release open", () => {
    expect(releaseDeepLinkHref('e2e-artist', RELEASE_ID)).toBe(
      `/releases?artist=e2e-artist&release=${RELEASE_ID}`
    );
  });

  it('encodes a slug that is not URL-safe', () => {
    expect(releaseDeepLinkHref('a&b c', RELEASE_ID)).toBe(
      `/releases?artist=a%26b%20c&release=${RELEASE_ID}`
    );
  });
});

describe('releaseDeepLinkUrl', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
  });

  it('prefixes the deep link with the host', () => {
    expect(releaseDeepLinkUrl('e2e-artist', RELEASE_ID)).toBe(
      `https://fakefour.test/releases?artist=e2e-artist&release=${RELEASE_ID}`
    );
  });

  it('falls back to the production host when no host name is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', undefined);

    expect(releaseDeepLinkUrl('e2e-artist', RELEASE_ID)).toBe(
      `https://fakefourrecords.com/releases?artist=e2e-artist&release=${RELEASE_ID}`
    );
  });
});
