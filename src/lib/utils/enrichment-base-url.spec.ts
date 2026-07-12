/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { resolveEnrichmentBaseUrl } from './enrichment-base-url';

vi.mock('server-only', () => ({}));

describe('resolveEnrichmentBaseUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns the configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');

    expect(resolveEnrichmentBaseUrl()).toBe('https://example.com');
  });

  it('trims a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com/');

    expect(resolveEnrichmentBaseUrl()).toBe('https://example.com');
  });

  it('returns null when unconfigured', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');

    expect(resolveEnrichmentBaseUrl()).toBeNull();
  });
});
