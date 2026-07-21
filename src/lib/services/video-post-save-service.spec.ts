/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  VideoArtistRepository,
  type VideoArtistWithArtist,
} from '@/lib/repositories/video-artist-repository';
import { ProducerService } from '@/lib/services/producer-service';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import type { VideoCategory } from '@/lib/types/domain/video';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';
import type { VideoProducerInput } from '@/lib/validation/video-producer-schema';

import {
  artistDetailsDiffer,
  planVideoPostSave,
  runVideoPostSave,
  syncVideoProducersAfterSave,
  videoPostSaveHasWork,
  type VideoPostSavePlan,
} from './video-post-save-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
}));
vi.mock('@/lib/services/video-probe-service', () => ({
  VideoProbeService: { probeAndPersist: vi.fn() },
}));
vi.mock('@/lib/services/producer-service', () => ({
  ProducerService: { syncVideoProducers: vi.fn() },
}));
vi.mock('@/lib/repositories/video-artist-repository', () => ({
  VideoArtistRepository: { findByVideoId: vi.fn() },
}));

const S3_KEY = 'media/videos/v1/clip.mp4';

/** Saved values for a create/draft, overridable per case. */
const nextValues = (overrides: {
  artist?: string;
  category?: VideoCategory;
  s3Key?: string;
  producers?: VideoProducerInput[];
  artistDetails?: VideoArtistDetail[];
}) => ({
  artist: 'Band',
  category: 'MUSIC' as VideoCategory,
  s3Key: S3_KEY,
  ...overrides,
});

describe('planVideoPostSave', () => {
  describe('a newly uploaded file (draft and create)', () => {
    it('always probes the file, because it has never been probed', () => {
      const plan = planVideoPostSave({ intent: 'create', next: nextValues({}) });

      expect(plan.probe).toBe(true);
    });

    it('syncs the artist links when the admin supplied an artist', () => {
      const plan = planVideoPostSave({ intent: 'create', next: nextValues({}) });

      expect(plan.syncArtists).toBe(true);
    });

    it('skips the artist sync when the artist is blank, minting no shell', () => {
      const plan = planVideoPostSave({ intent: 'draft', next: nextValues({ artist: '   ' }) });

      expect(plan.syncArtists).toBe(false);
    });

    it('still probes a blank-artist draft', () => {
      const plan = planVideoPostSave({ intent: 'draft', next: nextValues({ artist: '' }) });

      expect(plan.probe).toBe(true);
    });

    it('never syncs producers for a draft, which carries none', () => {
      const plan = planVideoPostSave({
        intent: 'draft',
        next: nextValues({ producers: [{ name: 'Pro' } as VideoProducerInput] }),
      });

      expect(plan.syncProducers).toBe(false);
    });

    it('syncs producers on create when the form supplied some', () => {
      const plan = planVideoPostSave({
        intent: 'create',
        next: nextValues({ producers: [{ name: 'Pro' } as VideoProducerInput] }),
      });

      expect(plan.syncProducers).toBe(true);
    });

    it('skips the producer sync on create when the list is empty, having nothing to clear', () => {
      const plan = planVideoPostSave({ intent: 'create', next: nextValues({ producers: [] }) });

      expect(plan.syncProducers).toBe(false);
    });
  });

  describe('the enrichment dispatch gate', () => {
    it('dispatches for a MUSIC video that has an artist', () => {
      const plan = planVideoPostSave({ intent: 'create', next: nextValues({}) });

      expect(plan.dispatchEnrichment).toBe(true);
    });

    it('does not dispatch for a non-MUSIC video', () => {
      const plan = planVideoPostSave({
        intent: 'create',
        next: nextValues({ category: 'INFORMATIONAL' }),
      });

      expect(plan.dispatchEnrichment).toBe(false);
    });

    it('does not dispatch when the artist is blank', () => {
      const plan = planVideoPostSave({ intent: 'create', next: nextValues({ artist: '  ' }) });

      expect(plan.dispatchEnrichment).toBe(false);
    });
  });

  describe('an update', () => {
    const previous = { artist: 'Band', s3Key: S3_KEY };

    it('kicks the artist sync when the artist string changed', () => {
      const plan = planVideoPostSave({
        intent: 'update',
        previous,
        next: nextValues({ artist: 'New Band' }),
      });

      expect(plan.syncArtists).toBe(true);
    });

    it('does not re-probe when only the artist changed', () => {
      const plan = planVideoPostSave({
        intent: 'update',
        previous,
        next: nextValues({ artist: 'New Band' }),
      });

      expect(plan.probe).toBe(false);
    });

    it('re-probes when the file was replaced', () => {
      const plan = planVideoPostSave({
        intent: 'update',
        previous,
        next: nextValues({ s3Key: 'media/videos/v1/replaced.mp4' }),
      });

      expect(plan.probe).toBe(true);
    });

    it('plans no enrichment work when nothing relevant changed', () => {
      const plan = planVideoPostSave({ intent: 'update', previous, next: nextValues({}) });

      expect(videoPostSaveHasWork(plan)).toBe(false);
    });

    it('defers to a stored-detail comparison on a details-only save', () => {
      const plan = planVideoPostSave({
        intent: 'update',
        previous,
        next: nextValues({ artistDetails: [{ sourceName: 'Band' } as VideoArtistDetail] }),
      });

      expect(plan.confirmArtistDetailsChanged).toBe(true);
    });

    it('kicks immediately rather than deferring when the artist also changed', () => {
      const plan = planVideoPostSave({
        intent: 'update',
        previous,
        next: nextValues({
          artist: 'New Band',
          artistDetails: [{ sourceName: 'New Band' } as VideoArtistDetail],
        }),
      });

      expect(plan.confirmArtistDetailsChanged).toBe(false);
    });

    it('skips the producer sync when the payload omitted producers entirely', () => {
      const plan = planVideoPostSave({ intent: 'update', previous, next: nextValues({}) });

      expect(plan.syncProducers).toBe(false);
    });

    it('syncs producers when the payload cleared them to an empty list', () => {
      const plan = planVideoPostSave({
        intent: 'update',
        previous,
        next: nextValues({ producers: [] }),
      });

      expect(plan.syncProducers).toBe(true);
    });
  });
});

describe('videoPostSaveHasWork', () => {
  it('reports work for a plan that only needs the deferred detail check', () => {
    const plan = planVideoPostSave({
      intent: 'update',
      previous: { artist: 'Band', s3Key: S3_KEY },
      next: nextValues({ artistDetails: [{ sourceName: 'Band' } as VideoArtistDetail] }),
    });

    expect(videoPostSaveHasWork(plan)).toBe(true);
  });

  it('reports work for a blank-artist draft, which still probes', () => {
    const plan = planVideoPostSave({ intent: 'draft', next: nextValues({ artist: '' }) });

    expect(videoPostSaveHasWork(plan)).toBe(true);
  });
});

const videoId = '507f1f77bcf86cd799439011';

/** A plan with every enrichment stage on, overridable per case. */
const fullPlan = (over: Partial<VideoPostSavePlan> = {}): VideoPostSavePlan => ({
  syncArtists: true,
  probe: true,
  dispatchEnrichment: true,
  confirmArtistDetailsChanged: false,
  syncProducers: false,
  ...over,
});

describe('runVideoPostSave', () => {
  const artist = 'Ceschi feat. Sage Francis';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
    vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
    vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
    vi.mocked(ProducerService.syncVideoProducers).mockResolvedValue(undefined);
  });

  it('syncs video artists from the artist string', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan() });

    expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
      videoId,
      artist,
      undefined
    );
  });

  it('forwards artistDetails as the third arg to syncVideoArtists', async () => {
    const artistDetails = [{ sourceName: 'Ceschi', displayName: 'Ceschi Ramos' }];

    await runVideoPostSave({ videoId, artist, artistDetails, plan: fullPlan() });

    expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
      videoId,
      artist,
      artistDetails
    );
  });

  it('probes when the plan says to', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan() });

    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
  });

  it('skips the probe when the plan says not to', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan({ probe: false }) });

    expect(VideoProbeService.probeAndPersist).not.toHaveBeenCalled();
  });

  it('dispatches the enrichment job when the plan says to', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan() });

    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
  });

  it('skips the dispatch when the plan says not to', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan({ dispatchEnrichment: false }) });

    expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
  });

  it('skips the artist sync when the plan says not to', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan({ syncArtists: false }) });

    expect(VideoEnrichmentService.syncVideoArtists).not.toHaveBeenCalled();
  });

  it('runs the sync before the probe and the probe before the job', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan() });

    const syncOrder = vi.mocked(VideoEnrichmentService.syncVideoArtists).mock
      .invocationCallOrder[0];
    const probeOrder = vi.mocked(VideoProbeService.probeAndPersist).mock.invocationCallOrder[0];
    const jobOrder = vi.mocked(VideoEnrichmentService.runEnrichmentJob).mock.invocationCallOrder[0];
    expect([syncOrder < probeOrder, probeOrder < jobOrder]).toEqual([true, true]);
  });

  it('still probes when the artist sync fails', async () => {
    vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('sync down'));

    await runVideoPostSave({ videoId, artist, plan: fullPlan() });

    expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
  });

  it('still dispatches the job when the probe fails', async () => {
    vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(Error('probe down'));

    await runVideoPostSave({ videoId, artist, plan: fullPlan() });

    expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
  });

  it('never throws even when every stage fails', async () => {
    vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('a'));
    vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(Error('b'));
    vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockRejectedValue(Error('c'));

    await expect(runVideoPostSave({ videoId, artist, plan: fullPlan() })).resolves.toBeUndefined();
  });

  it('never syncs producers, which are scheduled independently', async () => {
    await runVideoPostSave({ videoId, artist, plan: fullPlan({ syncProducers: true }) });

    expect(ProducerService.syncVideoProducers).not.toHaveBeenCalled();
  });

  describe('when the plan defers to a stored-detail comparison', () => {
    const deferred = fullPlan({ confirmArtistDetailsChanged: true, probe: false });
    const storedRow = {
      artistId: 'a1',
      role: 'PRIMARY',
      artist: {
        firstName: 'Alpha',
        middleName: null,
        surname: 'Beta',
        displayName: 'Alpha Beta',
        akaNames: null,
        bornOn: null,
      },
    } as VideoArtistWithArtist;

    it('runs the stages when the details actually differ', async () => {
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([storedRow]);

      await runVideoPostSave({
        videoId,
        artist,
        artistDetails: [{ sourceName: 'Alpha Beta', firstName: 'Changed' }],
        plan: deferred,
      });

      expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalled();
    });

    it('stops without touching the enrichment services when nothing changed', async () => {
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([storedRow]);

      await runVideoPostSave({
        videoId,
        artist,
        artistDetails: [{ sourceName: 'Alpha Beta', firstName: 'Alpha', surname: 'Beta' }],
        plan: deferred,
      });

      expect(VideoEnrichmentService.syncVideoArtists).not.toHaveBeenCalled();
    });

    it('does not dispatch the job on a no-op details save', async () => {
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([storedRow]);

      await runVideoPostSave({
        videoId,
        artist,
        artistDetails: [{ sourceName: 'Alpha Beta', firstName: 'Alpha', surname: 'Beta' }],
        plan: deferred,
      });

      expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
    });
  });
});

describe('artistDetailsDiffer', () => {
  const row = (over: Partial<VideoArtistWithArtist['artist']> = {}): VideoArtistWithArtist =>
    ({
      artistId: 'a1',
      role: 'PRIMARY',
      artist: {
        firstName: 'Alpha',
        middleName: null,
        surname: 'Beta',
        displayName: 'Alpha Beta',
        akaNames: null,
        bornOn: null,
        ...over,
      },
    }) as VideoArtistWithArtist;

  it('is false when every detail matches the linked artist', () => {
    const details = [{ sourceName: 'Alpha Beta', firstName: 'Alpha', surname: 'Beta' }];
    expect(artistDetailsDiffer(details, [row()])).toBe(false);
  });

  it('is true when a provided part differs', () => {
    const details = [{ sourceName: 'Alpha Beta', firstName: 'Changed' }];
    expect(artistDetailsDiffer(details, [row()])).toBe(true);
  });

  it('is true when the source name matches no linked artist', () => {
    expect(artistDetailsDiffer([{ sourceName: 'Nobody' }], [row()])).toBe(true);
  });
});

describe('syncVideoProducersAfterSave', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ProducerService.syncVideoProducers).mockResolvedValue(undefined);
  });

  it('syncs producers when provided', async () => {
    await syncVideoProducersAfterSave({ videoId, producers: [{ name: 'New Producer' }] });

    expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(
      videoId,
      [{ name: 'New Producer' }],
      undefined
    );
  });

  it('syncs an empty producers array (clear-to-zero)', async () => {
    await syncVideoProducersAfterSave({ videoId, producers: [] });

    expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(videoId, [], undefined);
  });

  it('forwards createdBy to syncVideoProducers', async () => {
    await syncVideoProducersAfterSave({
      videoId,
      producers: [{ id: 'p1', name: 'Rick' }],
      createdBy: 'user-abc',
    });

    expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(
      videoId,
      [{ id: 'p1', name: 'Rick' }],
      'user-abc'
    );
  });

  it('swallows a sync failure (best-effort)', async () => {
    vi.mocked(ProducerService.syncVideoProducers).mockRejectedValue(Error('producer sync down'));

    await expect(
      syncVideoProducersAfterSave({ videoId, producers: [{ name: 'Bad' }] })
    ).resolves.toBeUndefined();
  });
});
