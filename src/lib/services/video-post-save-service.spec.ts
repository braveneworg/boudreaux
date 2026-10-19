/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  VideoArtistRepository,
  type VideoArtistWithArtist,
} from '@/lib/repositories/video-artist-repository';
import { ProducerService } from '@/lib/services/producer-service';
import {
  VideoEnrichmentService,
  videoEnrichmentJob,
} from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import { loggers } from '@/lib/utils/logger';

import { VideoService } from './video-service';

import type { VideoPostSave } from './video-post-save-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/video-repository', () => ({ VideoRepository: {} }));
vi.mock('@/lib/utils/s3-client', () => ({ deleteS3Object: vi.fn() }));
vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
  videoEnrichmentJob: { markPending: vi.fn() },
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

// Capture after() callbacks so each case can run them on demand, in order.
const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

const videoId = '507f1f77bcf86cd799439011';
const S3_KEY = `media/videos/${videoId}/clip.mp4`;
const REPLACED_S3_KEY = `media/videos/${videoId}/replaced.mp4`;
const previous = { artist: 'Alpha Beta', s3Key: S3_KEY };

/** The linked artist row the details-only cases compare against. */
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

/** Schedule one save, then run every captured after() callback in order. */
const scheduleAndRun = async (save: VideoPostSave): Promise<void> => {
  await VideoService.schedulePostSave(save);
  for (const callback of afterCallbacks) await callback();
};

/** The stage services each case can observe, in pipeline order. */
const stageCalls = () => ({
  syncArtists: vi.mocked(VideoEnrichmentService.syncVideoArtists).mock.calls,
  probe: vi.mocked(VideoProbeService.probeAndPersist).mock.calls,
  enrichment: vi.mocked(VideoEnrichmentService.runEnrichmentJob).mock.calls,
  producers: vi.mocked(ProducerService.syncVideoProducers).mock.calls,
});

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.mocked(videoEnrichmentJob.markPending).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
  vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
  vi.mocked(ProducerService.syncVideoProducers).mockResolvedValue(undefined);
  vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([storedRow]);
});

describe('VideoService.schedulePostSave', () => {
  describe('a draft', () => {
    it('(a) marks enrichment pending before resolving, then runs sync, probe and enrichment in one after()', async () => {
      await VideoService.schedulePostSave({
        intent: 'draft',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY },
      });
      const pendingBeforeAfterRan = vi.mocked(videoEnrichmentJob.markPending).mock.calls.length;
      for (const callback of afterCallbacks) await callback();

      expect({
        pendingBeforeAfterRan,
        afterCount: afterCallbacks.length,
        ...stageCalls(),
      }).toEqual({
        pendingBeforeAfterRan: 1,
        afterCount: 1,
        syncArtists: [[videoId, 'Alpha Beta', undefined]],
        probe: [[videoId]],
        enrichment: [[videoId]],
        producers: [],
      });
    });

    it('(a) marks the draft video itself pending', async () => {
      await VideoService.schedulePostSave({
        intent: 'draft',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY },
      });

      expect(vi.mocked(videoEnrichmentJob.markPending).mock.calls[0]?.[0]).toBe(videoId);
    });

    it('(b) with a blank artist marks nothing pending and only probes', async () => {
      await scheduleAndRun({ intent: 'draft', videoId, next: { artist: '  ', s3Key: S3_KEY } });

      expect({
        pending: vi.mocked(videoEnrichmentJob.markPending).mock.calls,
        ...stageCalls(),
      }).toEqual({
        pending: [],
        syncArtists: [],
        probe: [[videoId]],
        enrichment: [],
        producers: [],
      });
    });

    it('(c) resolves when the pending write rejects', async () => {
      vi.spyOn(loggers.media, 'warn').mockImplementation(() => loggers.media);
      vi.mocked(videoEnrichmentJob.markPending).mockRejectedValueOnce(Error('db down'));

      await expect(
        VideoService.schedulePostSave({
          intent: 'draft',
          videoId,
          next: { artist: 'Alpha Beta', s3Key: S3_KEY },
        })
      ).resolves.toBeUndefined();
    });

    it('(c) logs the failed pending write and still schedules the pipeline', async () => {
      const warnSpy = vi.spyOn(loggers.media, 'warn').mockImplementation(() => loggers.media);
      vi.mocked(videoEnrichmentJob.markPending).mockRejectedValueOnce(Error('db down'));

      await VideoService.schedulePostSave({
        intent: 'draft',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY },
      });

      expect({ warn: warnSpy.mock.calls, afterCount: afterCallbacks.length }).toEqual({
        warn: [['video_draft_enrichment_pending_failed', { videoId, error: 'db down' }]],
        afterCount: 1,
      });
    });

    it('forwards the reviewed artist details to the artist sync', async () => {
      const artistDetails = [{ sourceName: 'Alpha Beta', displayName: 'A. Beta' }];

      await scheduleAndRun({
        intent: 'draft',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, artistDetails },
      });

      expect(stageCalls().syncArtists).toEqual([[videoId, 'Alpha Beta', artistDetails]]);
    });

    it('never syncs producers for a draft', async () => {
      await scheduleAndRun({
        intent: 'draft',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, producers: [{ name: 'Pro' }] },
      });

      expect(stageCalls().producers).toEqual([]);
    });
  });

  describe('a create', () => {
    it('(d) with producers syncs them in their own after(), after the stage pipeline', async () => {
      const producers = [{ name: 'Studio Pro' }];
      await VideoService.schedulePostSave({
        intent: 'create',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, producers },
        createdBy: 'user-123',
      });
      await afterCallbacks[1]?.();

      expect({ afterCount: afterCallbacks.length, ...stageCalls() }).toEqual({
        afterCount: 2,
        syncArtists: [],
        probe: [],
        enrichment: [],
        producers: [[videoId, producers, 'user-123']],
      });
    });

    it('(e) with an empty producer list schedules no producer sync', async () => {
      await scheduleAndRun({
        intent: 'create',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, producers: [] },
        createdBy: 'user-123',
      });

      expect({ afterCount: afterCallbacks.length, producers: stageCalls().producers }).toEqual({
        afterCount: 1,
        producers: [],
      });
    });

    it('runs artist sync, probe and enrichment for a new file with an artist', async () => {
      await scheduleAndRun({ intent: 'create', videoId, next: { artist: 'Alpha', s3Key: S3_KEY } });

      expect(stageCalls()).toEqual({
        syncArtists: [[videoId, 'Alpha', undefined]],
        probe: [[videoId]],
        enrichment: [[videoId]],
        producers: [],
      });
    });

    it('never marks enrichment pending', async () => {
      await scheduleAndRun({ intent: 'create', videoId, next: { artist: 'Alpha', s3Key: S3_KEY } });

      expect(videoEnrichmentJob.markPending).not.toHaveBeenCalled();
    });

    it('runs the artist sync before the probe and the probe before enrichment', async () => {
      await scheduleAndRun({ intent: 'create', videoId, next: { artist: 'Alpha', s3Key: S3_KEY } });

      const [sync] = vi.mocked(VideoEnrichmentService.syncVideoArtists).mock.invocationCallOrder;
      const [probe] = vi.mocked(VideoProbeService.probeAndPersist).mock.invocationCallOrder;
      const [job] = vi.mocked(VideoEnrichmentService.runEnrichmentJob).mock.invocationCallOrder;
      expect([sync < probe, probe < job]).toEqual([true, true]);
    });
  });

  describe('an update', () => {
    it('(f) with a changed artist syncs and dispatches enrichment without probing', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'New Band', s3Key: S3_KEY },
        previous,
        createdBy: 'user-123',
      });

      expect(stageCalls()).toEqual({
        syncArtists: [[videoId, 'New Band', undefined]],
        probe: [],
        enrichment: [[videoId]],
        producers: [],
      });
    });

    it('(f) kicks a changed artist without reading the stored links', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: {
          artist: 'New Band',
          s3Key: S3_KEY,
          artistDetails: [{ sourceName: 'New Band' }],
        },
        previous,
      });

      expect(VideoArtistRepository.findByVideoId).not.toHaveBeenCalled();
    });

    it('(g) with a replaced file probes it', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: REPLACED_S3_KEY },
        previous,
      });

      expect(stageCalls().probe).toEqual([[videoId]]);
    });

    it('(h) a details-only save matching the stored links calls no stage service', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: {
          artist: 'Alpha Beta',
          s3Key: S3_KEY,
          artistDetails: [{ sourceName: 'Alpha Beta', firstName: 'Alpha', surname: 'Beta' }],
        },
        previous,
      });

      expect(stageCalls()).toEqual({ syncArtists: [], probe: [], enrichment: [], producers: [] });
    });

    it('a details-only save that changes a name part syncs and dispatches without probing', async () => {
      const artistDetails = [{ sourceName: 'Alpha Beta', firstName: 'Changed' }];

      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, artistDetails },
        previous,
      });

      expect(stageCalls()).toEqual({
        syncArtists: [[videoId, 'Alpha Beta', artistDetails]],
        probe: [],
        enrichment: [[videoId]],
        producers: [],
      });
    });

    it('a details-only save naming an unlinked artist counts as a change', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, artistDetails: [{ sourceName: 'Nobody' }] },
        previous,
      });

      expect(stageCalls().syncArtists).toHaveLength(1);
    });

    it('a details-only save reads the stored links of this video', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: {
          artist: 'Alpha Beta',
          s3Key: S3_KEY,
          artistDetails: [{ sourceName: 'Alpha Beta', firstName: 'Changed' }],
        },
        previous,
      });

      expect(vi.mocked(VideoArtistRepository.findByVideoId).mock.calls).toEqual([[videoId]]);
    });

    it('an empty details list on an unchanged save schedules nothing', async () => {
      await VideoService.schedulePostSave({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, artistDetails: [] },
        previous,
      });

      expect(afterCallbacks).toHaveLength(0);
    });

    it('(i) with nothing relevant changed and producers present only syncs producers', async () => {
      const producers = [{ name: 'Studio Pro' }, { id: 'p2', name: 'Rick' }];

      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, producers },
        previous,
        createdBy: 'user-123',
      });

      expect({ afterCount: afterCallbacks.length, ...stageCalls() }).toEqual({
        afterCount: 1,
        syncArtists: [],
        probe: [],
        enrichment: [],
        producers: [[videoId, producers, 'user-123']],
      });
    });

    it('(i) clears producers when the save sends an empty list', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, producers: [] },
        previous,
        createdBy: 'user-123',
      });

      expect(stageCalls().producers).toEqual([[videoId, [], 'user-123']]);
    });

    it('(j) with producers omitted schedules no producer sync', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'New Band', s3Key: S3_KEY },
        previous,
      });

      expect({ afterCount: afterCallbacks.length, producers: stageCalls().producers }).toEqual({
        afterCount: 1,
        producers: [],
      });
    });

    it('never marks enrichment pending', async () => {
      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'New Band', s3Key: S3_KEY },
        previous,
      });

      expect(videoEnrichmentJob.markPending).not.toHaveBeenCalled();
    });
  });

  describe('a failing stage', () => {
    beforeEach(() => {
      vi.spyOn(loggers.media, 'warn').mockImplementation(() => loggers.media);
    });

    it('(k) logs a failed artist sync and still runs the probe and enrichment', async () => {
      vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValueOnce(Error('sync down'));

      await scheduleAndRun({ intent: 'create', videoId, next: { artist: 'Alpha', s3Key: S3_KEY } });

      expect({
        warn: vi.mocked(loggers.media.warn).mock.calls,
        probe: stageCalls().probe,
        enrichment: stageCalls().enrichment,
      }).toEqual({
        warn: [['Post-save video artist sync failed', { videoId, error: 'sync down' }]],
        probe: [[videoId]],
        enrichment: [[videoId]],
      });
    });

    it('(k) logs a failed probe and still dispatches enrichment', async () => {
      vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValueOnce(Error('probe down'));

      await scheduleAndRun({ intent: 'create', videoId, next: { artist: 'Alpha', s3Key: S3_KEY } });

      expect({
        warn: vi.mocked(loggers.media.warn).mock.calls,
        enrichment: stageCalls().enrichment,
      }).toEqual({
        warn: [['Post-save video probe failed', { videoId, error: 'probe down' }]],
        enrichment: [[videoId]],
      });
    });

    it('(k) never rejects when every stage fails', async () => {
      vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValueOnce(Error('a'));
      vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValueOnce(Error('b'));
      vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockRejectedValueOnce('c');
      vi.mocked(ProducerService.syncVideoProducers).mockRejectedValueOnce(Error('d'));

      await expect(
        scheduleAndRun({
          intent: 'create',
          videoId,
          next: { artist: 'Alpha', s3Key: S3_KEY, producers: [{ name: 'Pro' }] },
        })
      ).resolves.toBeUndefined();
    });

    it('(k) logs a failed producer sync', async () => {
      vi.mocked(ProducerService.syncVideoProducers).mockRejectedValueOnce(Error('producers down'));

      await scheduleAndRun({
        intent: 'update',
        videoId,
        next: { artist: 'Alpha Beta', s3Key: S3_KEY, producers: [{ name: 'Bad' }] },
        previous,
      });

      expect(vi.mocked(loggers.media.warn).mock.calls).toEqual([
        ['Post-save video producer sync failed', { videoId, error: 'producers down' }],
      ]);
    });
  });
});
