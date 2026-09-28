/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArtistCreditRepository } from '@/lib/repositories/artist-credit-repository';
import { DataError } from '@/lib/types/domain/errors';
import type {
  CreditAwaitingConfirmation,
  CreditThatStaysHidden,
} from '@/lib/utils/credit-confirmation';
import { invalidatePublicNameCaches } from '@/lib/utils/public-name-caches';

import { CreditConfirmationService } from './credit-confirmation-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/artist-credit-repository', () => ({
  ArtistCreditRepository: {
    findAwaitingConfirmation: vi.fn(),
    findThatStayHidden: vi.fn(),
    findAwaitingConfirmationAmong: vi.fn(),
    findThatStayHiddenAmong: vi.fn(),
    publishCredited: vi.fn(),
    findPublishedWorkCreditedTo: vi.fn(),
  },
}));

vi.mock('@/lib/utils/public-name-caches', () => ({
  invalidatePublicNameCaches: vi.fn(),
}));

const NOW = new Date('2026-09-27T12:00:00.000Z');

const abel: CreditAwaitingConfirmation = {
  id: 'a',
  slug: 'abel',
  name: 'Abel',
  bioState: 'none',
  bioGeneratedAt: null,
  displayImageCount: 0,
};
const bea: CreditAwaitingConfirmation = { ...abel, id: 'b', slug: 'bea', name: 'Bea' };
const gone: CreditThatStaysHidden = { id: 'x', slug: 'gone', name: 'Gone', reason: 'deleted' };

describe('CreditConfirmationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(ArtistCreditRepository.findAwaitingConfirmation).mockResolvedValue([abel, bea]);
    vi.mocked(ArtistCreditRepository.findThatStayHidden).mockResolvedValue([gone]);
    vi.mocked(ArtistCreditRepository.findAwaitingConfirmationAmong).mockResolvedValue([abel]);
    vi.mocked(ArtistCreditRepository.findThatStayHiddenAmong).mockResolvedValue([]);
    vi.mocked(ArtistCreditRepository.publishCredited).mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('forRelease', () => {
    it('returns the credits awaiting confirmation and those that stay hidden', async () => {
      const result = await CreditConfirmationService.forRelease('release-1');

      expect(result).toEqual({
        success: true,
        data: { awaiting: [abel, bea], stayHidden: [gone] },
      });
    });

    it('reads both lists for the release', async () => {
      await CreditConfirmationService.forRelease('release-1');

      expect({
        awaiting: vi.mocked(ArtistCreditRepository.findAwaitingConfirmation).mock.calls,
        hidden: vi.mocked(ArtistCreditRepository.findThatStayHidden).mock.calls,
      }).toEqual({ awaiting: [['release-1']], hidden: [['release-1']] });
    });

    it('fails with the data error code when the read fails', async () => {
      vi.mocked(ArtistCreditRepository.findAwaitingConfirmation).mockRejectedValueOnce(
        new DataError('UNAVAILABLE', 'down')
      );

      const result = await CreditConfirmationService.forRelease('release-1');

      expect(result).toMatchObject({ success: false, code: 'UNAVAILABLE' });
    });
  });

  describe('forArtists', () => {
    it('returns the same two lists for artists a release will credit', async () => {
      const result = await CreditConfirmationService.forArtists(['a', 'c']);

      expect(result).toEqual({ success: true, data: { awaiting: [abel], stayHidden: [] } });
    });

    it('reads both lists for the given artists', async () => {
      await CreditConfirmationService.forArtists(['a', 'c']);

      expect({
        awaiting: vi.mocked(ArtistCreditRepository.findAwaitingConfirmationAmong).mock.calls,
        hidden: vi.mocked(ArtistCreditRepository.findThatStayHiddenAmong).mock.calls,
      }).toEqual({ awaiting: [[['a', 'c']]], hidden: [[['a', 'c']]] });
    });
  });

  describe('check', () => {
    it('passes when every awaiting credit of the release has a decision', async () => {
      const result = await CreditConfirmationService.check(
        { releaseId: 'release-1' },
        { publishArtistIds: ['a'], keepHiddenArtistIds: ['b'] }
      );

      expect(result).toEqual({ success: true, data: undefined });
    });

    it('fails with VALIDATION naming the undecided credits', async () => {
      const result = await CreditConfirmationService.check(
        { releaseId: 'release-1' },
        { publishArtistIds: ['a'], keepHiddenArtistIds: [] }
      );

      expect(result).toEqual({
        success: false,
        code: 'VALIDATION',
        error: 'Choose to publish or keep hidden: Bea',
      });
    });

    it('checks against the given artists when the credits are not stored yet', async () => {
      const result = await CreditConfirmationService.check(
        { artistIds: ['a', 'c'] },
        { publishArtistIds: ['a'], keepHiddenArtistIds: [] }
      );

      expect(result).toEqual({ success: true, data: undefined });
    });
  });

  describe('publishConfirmed', () => {
    const input = {
      releaseId: 'release-1',
      decisions: { publishArtistIds: ['a'], keepHiddenArtistIds: ['b'] },
      publishedBy: 'admin-1',
    };

    it('publishes only the artists the admin chose to publish', async () => {
      await CreditConfirmationService.publishConfirmed(input);

      expect(vi.mocked(ArtistCreditRepository.publishCredited).mock.calls).toEqual([
        [{ releaseId: 'release-1', artistIds: ['a'], publishedBy: 'admin-1', now: NOW }],
      ]);
    });

    it('returns the number of artists published', async () => {
      const result = await CreditConfirmationService.publishConfirmed(input);

      expect(result).toEqual({ success: true, data: 1 });
    });

    it('clears the public name caches', async () => {
      await CreditConfirmationService.publishConfirmed(input);

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([[]]);
    });

    it('fails with VALIDATION and writes nothing when a credit is undecided', async () => {
      const result = await CreditConfirmationService.publishConfirmed({
        ...input,
        decisions: { publishArtistIds: ['a'], keepHiddenArtistIds: [] },
      });

      expect({
        result,
        writes: vi.mocked(ArtistCreditRepository.publishCredited).mock.calls,
      }).toEqual({
        result: {
          success: false,
          code: 'VALIDATION',
          error: 'Choose to publish or keep hidden: Bea',
        },
        writes: [],
      });
    });

    it('writes nothing when every credit is kept hidden', async () => {
      await CreditConfirmationService.publishConfirmed({
        ...input,
        decisions: { publishArtistIds: [], keepHiddenArtistIds: ['a', 'b'] },
      });

      expect(vi.mocked(ArtistCreditRepository.publishCredited).mock.calls).toEqual([]);
    });
  });

  describe('publishedWorkCreditedTo', () => {
    it('returns the public work that carries the artist name', async () => {
      const work = { releases: [{ id: 'r', title: 'Album' }], tourDates: [] };
      vi.mocked(ArtistCreditRepository.findPublishedWorkCreditedTo).mockResolvedValueOnce(work);

      const result = await CreditConfirmationService.publishedWorkCreditedTo('artist-1');

      expect(result).toEqual({ success: true, data: work });
    });
  });
});
