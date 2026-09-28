/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { invalidatePublicNameCaches } from './public-name-caches';
import { cache } from './simple-cache';

vi.mock('./simple-cache', () => ({
  cache: { deleteByPrefix: vi.fn() },
}));

describe('invalidatePublicNameCaches', () => {
  it('clears the published-releases and featured-artists listings', () => {
    invalidatePublicNameCaches();

    expect(vi.mocked(cache.deleteByPrefix).mock.calls).toEqual([
      ['published-releases:'],
      ['featured-artists:'],
    ]);
  });
});
