/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ReleaseService } from '@/lib/services/release-service';

import { createRelease, getReleases } from './release-repository';

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getReleases: vi.fn(),
    createRelease: vi.fn(),
  },
}));

describe('release-repository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getReleases', () => {
    it('forwards search/skip/take params verbatim to ReleaseService.getReleases', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue([] as never);

      await getReleases({ skip: 10, take: 5, search: 'tour' });

      expect(ReleaseService.getReleases).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
        search: 'tour',
      });
    });

    it('returns the value produced by the service untouched', async () => {
      const sentinel = [{ id: 'r-1' }] as never;
      vi.mocked(ReleaseService.getReleases).mockResolvedValue(sentinel);

      const result = await getReleases({});

      expect(result).toBe(sentinel);
    });
  });

  describe('createRelease', () => {
    it('forwards the create input verbatim to ReleaseService.createRelease', async () => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({ id: 'r-1' } as never);
      const input = { title: 'Album' } as never;

      await createRelease(input);

      expect(ReleaseService.createRelease).toHaveBeenCalledWith(input);
    });
  });
});
