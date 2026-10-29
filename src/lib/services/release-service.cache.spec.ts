/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { DataError } from '@/lib/types/domain/errors';
import { cache } from '@/lib/utils/simple-cache';

import { ReleaseService } from './release-service';

// The published-releases listing cache, through the service's own interface:
// the real in-memory cache, with the listing read counted at the repository.

vi.mock('server-only', () => ({}));

vi.mock('@/lib/utils/s3-client', () => ({
  deleteS3Object: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/repositories/release-repository', () => ({
  ReleaseRepository: {
    createWithCredits: vi.fn(),
    updateWithCredits: vi.fn(),
    delete: vi.fn(),
    findPublished: vi.fn(),
  },
}));

const deletedRelease = { id: 'release-123', coverArt: '', digitalFormats: [], images: [] };

/** How many times the listing was read from the repository. */
const listingReads = (): number => vi.mocked(ReleaseRepository.findPublished).mock.calls.length;

describe('ReleaseService published-releases listing cache', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_MODE', 'false');
    cache.clear();
    vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([]);
  });

  it('serves a second read from the cache when nothing is written between', async () => {
    await ReleaseService.getPublishedReleases();
    await ReleaseService.getPublishedReleases();

    expect(listingReads()).toBe(1);
  });

  it('reads the listing again after a release is deleted', async () => {
    vi.mocked(ReleaseRepository.delete).mockResolvedValueOnce(deletedRelease as never);

    await ReleaseService.getPublishedReleases();
    await ReleaseService.deleteRelease('release-123');
    await ReleaseService.getPublishedReleases();

    expect(listingReads()).toBe(2);
  });

  it('reads the listing again after an update that does not publish', async () => {
    vi.mocked(ReleaseRepository.updateWithCredits).mockResolvedValueOnce(deletedRelease as never);

    await ReleaseService.getPublishedReleases();
    await ReleaseService.updateRelease('release-123', { title: 'Renamed' });
    await ReleaseService.getPublishedReleases();

    expect(listingReads()).toBe(2);
  });

  it('keeps serving the cached listing when a delete fails', async () => {
    vi.mocked(ReleaseRepository.delete).mockRejectedValueOnce(
      new DataError('NOT_FOUND', 'Release not found')
    );

    await ReleaseService.getPublishedReleases();
    await ReleaseService.deleteRelease('release-123');
    await ReleaseService.getPublishedReleases();

    expect(listingReads()).toBe(1);
  });

  // A created release is never published, so the listing cannot show it.
  it('keeps serving the cached listing after a release is created', async () => {
    vi.mocked(ReleaseRepository.createWithCredits).mockResolvedValueOnce(deletedRelease as never);

    await ReleaseService.getPublishedReleases();
    await ReleaseService.createRelease({
      title: 'New',
      releasedOn: new Date('2026-10-19'),
      coverArt: 'https://cdn.example.com/cover.webp',
      formats: ['DIGITAL'],
    });
    await ReleaseService.getPublishedReleases();

    expect(listingReads()).toBe(1);
  });
});
