/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArtistCreditRepository } from '@/lib/repositories/artist-credit-repository';
import { DataError } from '@/lib/types/domain/errors';
import type {
  CreditAwaitingConfirmation,
  CreditThatStaysHidden,
} from '@/lib/utils/credit-confirmation';

import { CreditConfirmationService } from './credit-confirmation-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/artist-credit-repository', () => ({
  ArtistCreditRepository: {
    findAwaitingConfirmation: vi.fn(),
    findThatStayHidden: vi.fn(),
    findAwaitingConfirmationAmong: vi.fn(),
    findThatStayHiddenAmong: vi.fn(),
    findPublishedWorkCreditedTo: vi.fn(),
  },
}));

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
    vi.mocked(ArtistCreditRepository.findAwaitingConfirmation).mockResolvedValue([abel, bea]);
    vi.mocked(ArtistCreditRepository.findThatStayHidden).mockResolvedValue([gone]);
    vi.mocked(ArtistCreditRepository.findAwaitingConfirmationAmong).mockResolvedValue([abel]);
    vi.mocked(ArtistCreditRepository.findThatStayHiddenAmong).mockResolvedValue([]);
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
    it('passes when every awaiting credit among the artists has a decision', async () => {
      const result = await CreditConfirmationService.check(['a', 'c'], {
        publishArtistIds: ['a'],
        keepHiddenArtistIds: [],
      });

      expect(result).toEqual({ success: true, data: undefined });
    });

    it('reads the artists the write is about to credit', async () => {
      await CreditConfirmationService.check(['a', 'c'], {
        publishArtistIds: ['a'],
        keepHiddenArtistIds: [],
      });

      expect(vi.mocked(ArtistCreditRepository.findAwaitingConfirmationAmong).mock.calls).toEqual([
        [['a', 'c']],
      ]);
    });

    it('fails with VALIDATION naming the undecided credits', async () => {
      vi.mocked(ArtistCreditRepository.findAwaitingConfirmationAmong).mockResolvedValueOnce([
        abel,
        bea,
      ]);

      const result = await CreditConfirmationService.check(['a', 'b'], {
        publishArtistIds: ['a'],
        keepHiddenArtistIds: [],
      });

      expect(result).toEqual({
        success: false,
        code: 'VALIDATION',
        error: 'Choose to publish or keep hidden: Bea',
      });
    });

    it('fails with the data error code when the read fails', async () => {
      vi.mocked(ArtistCreditRepository.findAwaitingConfirmationAmong).mockRejectedValueOnce(
        new DataError('UNAVAILABLE', 'down')
      );

      const result = await CreditConfirmationService.check(['a'], {
        publishArtistIds: [],
        keepHiddenArtistIds: [],
      });

      expect(result).toMatchObject({ success: false, code: 'UNAVAILABLE' });
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
