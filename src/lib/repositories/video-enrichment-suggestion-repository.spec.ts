/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';
import type { CreateSuggestionRow } from '@/lib/types/domain/video-enrichment';

import { VideoEnrichmentSuggestionRepository } from './video-enrichment-suggestion-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => {
  const videoEnrichmentSuggestion = {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  };
  return {
    prisma: {
      videoEnrichmentSuggestion,
      $transaction: vi.fn(
        async (
          fn: (tx: {
            videoEnrichmentSuggestion: typeof videoEnrichmentSuggestion;
          }) => Promise<unknown>
        ) => fn({ videoEnrichmentSuggestion })
      ),
    },
  };
});

const VIDEO_ID = 'f'.repeat(24);
const ARTIST_ID = 'a'.repeat(24);
const SUGGESTION_ID = 'c'.repeat(24);

const row: CreateSuggestionRow = {
  artistId: ARTIST_ID,
  field: 'bornOn',
  value: '1985-03-15',
  confidence: 'high',
  sources: [{ url: 'https://musicbrainz.org/artist/x' }],
  note: null,
};

describe('VideoEnrichmentSuggestionRepository', () => {
  describe('replacePending', () => {
    it('deletes only the pending rows then bulk-creates the batch as pending', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.videoEnrichmentSuggestion.createMany).mockResolvedValue({ count: 1 });

      await VideoEnrichmentSuggestionRepository.replacePending(VIDEO_ID, [row]);

      expect(prisma.videoEnrichmentSuggestion.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID, status: 'pending' },
      });
      expect(prisma.videoEnrichmentSuggestion.createMany).toHaveBeenCalledWith({
        data: [{ ...row, videoId: VIDEO_ID, status: 'pending' }],
      });
    });

    it('skips createMany for an empty batch', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 0 });

      await VideoEnrichmentSuggestionRepository.replacePending(VIDEO_ID, []);

      expect(prisma.videoEnrichmentSuggestion.createMany).not.toHaveBeenCalled();
    });

    it('runs the delete-then-create inside a single transaction', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.videoEnrichmentSuggestion.createMany).mockResolvedValue({ count: 1 });

      await VideoEnrichmentSuggestionRepository.replacePending(VIDEO_ID, [row]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByVideoId', () => {
    it('lists the video rows ordered by createdAt asc', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.findMany).mockResolvedValue([] as never);

      await VideoEnrichmentSuggestionRepository.findByVideoId(VIDEO_ID);

      expect(prisma.videoEnrichmentSuggestion.findMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('returns the row when found', async () => {
      const stored = { id: SUGGESTION_ID, status: 'pending' };
      vi.mocked(prisma.videoEnrichmentSuggestion.findUnique).mockResolvedValue(stored as never);

      const result = await VideoEnrichmentSuggestionRepository.findById(SUGGESTION_ID);

      expect(result).toEqual(stored);
    });

    it('returns null when missing', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.findUnique).mockResolvedValue(null);

      const result = await VideoEnrichmentSuggestionRepository.findById(SUGGESTION_ID);

      expect(result).toBeNull();
    });
  });

  describe('markApplied', () => {
    it('conditionally flips a pending row to applied with the audit fields', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 1 });

      const result = await VideoEnrichmentSuggestionRepository.markApplied(SUGGESTION_ID, 'user-1');

      expect(result).toBe(true);
      expect(prisma.videoEnrichmentSuggestion.updateMany).toHaveBeenCalledWith({
        where: { id: SUGGESTION_ID, status: 'pending' },
        data: { status: 'applied', appliedAt: expect.any(Date), appliedBy: 'user-1' },
      });
    });

    it('returns false when the row was already resolved', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 0 });

      const result = await VideoEnrichmentSuggestionRepository.markApplied(SUGGESTION_ID, 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('markDismissed', () => {
    it('conditionally flips a pending row to dismissed', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 1 });

      const result = await VideoEnrichmentSuggestionRepository.markDismissed(SUGGESTION_ID);

      expect(result).toBe(true);
      expect(prisma.videoEnrichmentSuggestion.updateMany).toHaveBeenCalledWith({
        where: { id: SUGGESTION_ID, status: 'pending' },
        data: { status: 'dismissed' },
      });
    });

    it('returns false when the row was already resolved', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 0 });

      const result = await VideoEnrichmentSuggestionRepository.markDismissed(SUGGESTION_ID);

      expect(result).toBe(false);
    });
  });

  describe('findExistingFacts', () => {
    it('projects applied and dismissed facts only', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.findMany).mockResolvedValue([] as never);

      await VideoEnrichmentSuggestionRepository.findExistingFacts(VIDEO_ID);

      expect(prisma.videoEnrichmentSuggestion.findMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID, status: { in: ['applied', 'dismissed'] } },
        select: { artistId: true, field: true, value: true },
      });
    });
  });

  describe('deletePendingForArtists', () => {
    it('deletes pending rows scoped to the detached artist ids', async () => {
      vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 1 });

      await VideoEnrichmentSuggestionRepository.deletePendingForArtists(VIDEO_ID, [ARTIST_ID]);

      expect(prisma.videoEnrichmentSuggestion.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID, status: 'pending', artistId: { in: [ARTIST_ID] } },
      });
    });

    it('is a no-op for an empty artist list', async () => {
      await VideoEnrichmentSuggestionRepository.deletePendingForArtists(VIDEO_ID, []);

      expect(prisma.videoEnrichmentSuggestion.deleteMany).not.toHaveBeenCalled();
    });
  });
});
