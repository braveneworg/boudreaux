/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';
import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';
import { ArtistService } from '@/lib/services/artist-service';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type {
  VideoEnrichmentState,
  VideoEnrichmentSuggestionRecord,
} from '@/lib/types/domain/video-enrichment';
import {
  videoEnrichmentCallbackSchema,
  videoEnrichmentProgressPostSchema,
  type VideoEnrichmentResult,
  type VideoSuggestionField,
} from '@/lib/validation/video-enrichment-schema';
import { splitFeaturedArtists } from '@/utils/artist-name-split';

import { videoEnrichmentFixture } from './video-enrichment-fixture';
import { videoEnrichmentJob, VideoEnrichmentService } from './video-enrichment-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: {
    getEnrichmentState: vi.fn(),
    setEnrichmentStatus: vi.fn(),
    beginEnrichmentRun: vi.fn(),
    setEnrichmentJobToken: vi.fn(),
    claimEnrichmentJobToken: vi.fn(),
    setEnrichmentProgress: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/video-artist-repository', () => ({
  VideoArtistRepository: {
    replaceForVideo: vi.fn(),
    findByVideoId: vi.fn(),
    deleteByVideoId: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/video-enrichment-suggestion-repository', () => ({
  VideoEnrichmentSuggestionRepository: {
    replacePending: vi.fn(),
    createApplied: vi.fn(),
    findByVideoId: vi.fn(),
    findById: vi.fn(),
    markApplied: vi.fn(),
    markDismissed: vi.fn(),
    findExistingFacts: vi.fn(),
    deletePendingForArtists: vi.fn(),
  },
}));
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: { findOrCreateByName: vi.fn() },
}));
vi.mock('@/utils/artist-name-split', () => ({ splitFeaturedArtists: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

const VIDEO_ID = 'f'.repeat(24);
const ARTIST_ID = 'a'.repeat(24);
const OTHER_ID = 'b'.repeat(24);

const baseState = (overrides: Partial<VideoEnrichmentState> = {}): VideoEnrichmentState => ({
  id: VIDEO_ID,
  enrichmentStatus: null,
  enrichmentError: null,
  enrichmentStartedAt: null,
  enrichmentJobToken: null,
  enrichmentProgress: null,
  enrichedAt: null,
  category: 'MUSIC',
  artist: 'Ceschi',
  title: 'Bite Through Stone',
  releasedOn: new Date('2021-04-09T00:00:00.000Z'),
  description: null,
  s3Key: 'media/videos/abc.mp4',
  ...overrides,
});

const artistRow = (overrides: Partial<VideoArtistWithArtist> = {}): VideoArtistWithArtist => ({
  artistId: ARTIST_ID,
  role: 'PRIMARY',
  sortOrder: 0,
  artist: {
    displayName: 'Ceschi',
    firstName: 'Francisco',
    middleName: null,
    surname: 'Ramos',
    akaNames: null,
    bornOn: null,
  },
  ...overrides,
});

beforeEach(() => {
  vi.mocked(VideoRepository.setEnrichmentStatus).mockResolvedValue(undefined);
  vi.mocked(VideoRepository.setEnrichmentJobToken).mockResolvedValue(undefined);
  vi.mocked(VideoRepository.setEnrichmentProgress).mockResolvedValue(undefined);
  vi.mocked(VideoArtistRepository.replaceForVideo).mockResolvedValue(undefined);
  vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);
  vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockResolvedValue(undefined);
  vi.mocked(VideoRepository.beginEnrichmentRun).mockResolvedValue(true);
  vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([]);
  vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([]);
  vi.mocked(VideoEnrichmentSuggestionRepository.deletePendingForArtists).mockResolvedValue(
    undefined
  );
});

afterEach(() => vi.unstubAllEnvs());

describe('syncVideoArtists', () => {
  it('creates a shell per split name and replaces the join rows in order', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sole', role: 'featured' },
    ]);
    vi.mocked(ArtistService.findOrCreateByName)
      .mockResolvedValueOnce({
        success: true,
        data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: OTHER_ID, displayName: 'Sole', firstName: 'Tim', surname: 'Holland' },
      });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. Sole');

    expect(VideoArtistRepository.replaceForVideo).toHaveBeenCalledWith(VIDEO_ID, [
      { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0 },
      { artistId: OTHER_ID, role: 'FEATURED', sortOrder: 1 },
    ]);
  });

  it('continues past a failed shell creation (best-effort)', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sole', role: 'featured' },
    ]);
    vi.mocked(ArtistService.findOrCreateByName)
      .mockResolvedValueOnce({ success: false, error: 'db down', code: 'UNAVAILABLE' })
      .mockResolvedValueOnce({
        success: true,
        data: { id: OTHER_ID, displayName: 'Sole', firstName: 'Tim', surname: 'Holland' },
      });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. Sole');

    expect(VideoArtistRepository.replaceForVideo).toHaveBeenCalledWith(VIDEO_ID, [
      { artistId: OTHER_ID, role: 'FEATURED', sortOrder: 0 },
    ]);
  });

  it('dedupes a repeated artist so the unique join constraint cannot trip', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([
      { name: 'Ceschi', role: 'primary' },
      { name: 'CESCHI', role: 'featured' },
    ]);
    vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
      success: true,
      data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
    });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. CESCHI');

    expect(VideoArtistRepository.replaceForVideo).toHaveBeenCalledWith(VIDEO_ID, [
      { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0 },
    ]);
  });

  it('drops pending suggestions for artists detached by the re-sync', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow(),
      artistRow({ artistId: OTHER_ID, sortOrder: 1, role: 'FEATURED' }),
    ]);
    vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
      success: true,
      data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
    });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi');

    expect(VideoEnrichmentSuggestionRepository.deletePendingForArtists).toHaveBeenCalledWith(
      VIDEO_ID,
      [OTHER_ID]
    );
  });

  it('forwards matched detail to findOrCreateByName by lowercased sourceName', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([
      { name: 'A', role: 'primary' },
      { name: 'Zora Quill Brandt', role: 'featured' },
    ]);
    vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
      success: true,
      data: { id: ARTIST_ID, displayName: 'A', firstName: 'A', surname: '' },
    });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'A feat. Zora Quill Brandt', [
      { sourceName: 'zora quill brandt', firstName: 'Zora', surname: 'Brandt' },
    ]);

    // First call (name 'A') — no matching detail → undefined
    expect(ArtistService.findOrCreateByName).toHaveBeenNthCalledWith(1, 'A', undefined);
    // Second call (name 'Zora Quill Brandt') — matched by lowercased sourceName
    expect(ArtistService.findOrCreateByName).toHaveBeenNthCalledWith(2, 'Zora Quill Brandt', {
      sourceName: 'zora quill brandt',
      firstName: 'Zora',
      surname: 'Brandt',
    });
  });

  it('never forwards a stale detail whose sourceName is absent from the artist string', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
    vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
      success: true,
      data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
    });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi', [
      { sourceName: 'stale artist', firstName: 'Stale', surname: 'Artist' },
    ]);

    expect(ArtistService.findOrCreateByName).toHaveBeenCalledWith('Ceschi', undefined);
  });

  it('passes undefined details to every call when artistDetails is omitted', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sole', role: 'featured' },
    ]);
    vi.mocked(ArtistService.findOrCreateByName)
      .mockResolvedValueOnce({
        success: true,
        data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: OTHER_ID, displayName: 'Sole', firstName: 'Tim', surname: 'Holland' },
      });

    await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. Sole');

    expect(ArtistService.findOrCreateByName).toHaveBeenNthCalledWith(1, 'Ceschi', undefined);
    expect(ArtistService.findOrCreateByName).toHaveBeenNthCalledWith(2, 'Sole', undefined);
  });
});

describe('runEnrichmentJob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the video enrichment job through the job runner', async () => {
    const run = vi.spyOn(jobRunner, 'run').mockResolvedValueOnce({ status: 'skipped' });

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(run.mock.calls).toEqual([[videoEnrichmentJob, VIDEO_ID, undefined]]);
  });
});

describe('videoEnrichmentJob.refusal', () => {
  it('refuses a video whose artist is blank, with the trigger copy', () => {
    expect(videoEnrichmentJob.refusal?.(baseState({ artist: '   ' }))).toBe(
      'Add an artist or creator and save before running enrichment.'
    );
  });

  it('accepts an INFORMATIONAL video that names a creator', () => {
    expect(
      videoEnrichmentJob.refusal?.(
        baseState({ category: 'INFORMATIONAL', artist: 'Narrator Nell' })
      )
    ).toBeNull();
  });
});

describe('videoEnrichmentJob.prepare', () => {
  /** The Lambda request the adapter prepares for the video; throws on a refusal. */
  const requestFor = async (): Promise<Record<string, unknown>> => {
    const prepared = await videoEnrichmentJob.prepare(VIDEO_ID, undefined);
    if (!prepared.ok) throw new Error(prepared.error);
    return prepared.request;
  };

  beforeEach(() => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
  });

  it('builds the video-enrichment request from the video and its linked artists', async () => {
    expect(await requestFor()).toEqual({
      task: 'video-enrichment',
      videoId: VIDEO_ID,
      title: 'Bite Through Stone',
      artistDisplay: 'Ceschi',
      category: 'MUSIC',
      releasedOn: '2021-04-09',
      artists: [
        {
          artistId: ARTIST_ID,
          name: 'Ceschi',
          role: 'primary',
          known: { firstName: 'Francisco', surname: 'Ramos', displayName: 'Ceschi' },
        },
      ],
    });
  });

  it('sends the INFORMATIONAL category for a creator video', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ category: 'INFORMATIONAL', artist: 'Narrator Nell' })
    );

    expect((await requestFor()).category).toBe('INFORMATIONAL');
  });

  it('omits releasedOn when the draft has no release date', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ releasedOn: null })
    );

    expect(await requestFor()).toHaveProperty('releasedOn', undefined);
  });

  it('fails when the video has no linked artists to enrich', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);

    expect(await videoEnrichmentJob.prepare(VIDEO_ID, undefined)).toEqual({
      ok: false,
      error: 'No linked artists to enrich.',
    });
  });

  it('fails when the video is gone', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    expect(await videoEnrichmentJob.prepare(VIDEO_ID, undefined)).toEqual({
      ok: false,
      error: 'Video not found.',
    });
  });

  it('sends the linked artists with their known identity fields', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: 'Ceschi',
          firstName: 'Francisco',
          middleName: null,
          surname: 'Ramos',
          akaNames: 'Ceschi Ramos',
          bornOn: new Date('1980-01-02T00:00:00.000Z'),
        },
      }),
    ]);

    expect((await requestFor()).artists).toEqual([
      {
        artistId: ARTIST_ID,
        name: 'Ceschi',
        role: 'primary',
        known: {
          firstName: 'Francisco',
          surname: 'Ramos',
          displayName: 'Ceschi',
          akaNames: 'Ceschi Ramos',
          bornOn: '1980-01-02',
        },
      },
    ]);
  });

  it('maps a FEATURED join row onto the featured role', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({ role: 'FEATURED' }),
    ]);

    expect((await requestFor()).artists).toEqual([
      {
        artistId: ARTIST_ID,
        name: 'Ceschi',
        role: 'featured',
        known: { firstName: 'Francisco', surname: 'Ramos', displayName: 'Ceschi' },
      },
    ]);
  });

  it('omits the identity fields a mononym artist has left empty', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: 'Sole',
          firstName: '',
          middleName: null,
          surname: '',
          akaNames: null,
          bornOn: null,
        },
      }),
    ]);

    expect((await requestFor()).artists).toEqual([
      { artistId: ARTIST_ID, name: 'Sole', role: 'primary', known: { displayName: 'Sole' } },
    ]);
  });

  it('sends a middle name as part of the known identity block', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: null,
          firstName: 'Francisco',
          middleName: 'Xavier',
          surname: 'Ramos',
          akaNames: null,
          bornOn: null,
        },
      }),
    ]);

    expect((await requestFor()).artists).toEqual([
      {
        artistId: ARTIST_ID,
        name: 'Francisco Ramos',
        role: 'primary',
        known: { firstName: 'Francisco', middleName: 'Xavier', surname: 'Ramos' },
      },
    ]);
  });

  it('omits the known block entirely for an artist shell with no identity fields', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: null,
          firstName: '',
          middleName: null,
          surname: '',
          akaNames: null,
          bornOn: null,
        },
      }),
    ]);

    expect((await requestFor()).artists).toEqual([
      { artistId: ARTIST_ID, name: '', role: 'primary' },
    ]);
  });
});

describe('videoEnrichmentJob — the video enrichment columns', () => {
  const START = new Date('2026-10-18T12:00:00.000Z');
  const progress = { stage: 'wikidata', counts: { artists: 2 }, at: START.toISOString() };
  const record = baseState({
    enrichmentStatus: 'processing',
    enrichmentError: 'earlier',
    enrichmentStartedAt: START,
    enrichmentJobToken: 'tok',
    enrichmentProgress: progress,
  });

  it('reads the enrichment state', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValueOnce(record);

    expect(await videoEnrichmentJob.read(VIDEO_ID)).toBe(record);
    expect(VideoRepository.getEnrichmentState).toHaveBeenCalledWith(VIDEO_ID);
  });

  it('maps the enrichment lifecycle columns onto the job state', () => {
    expect(videoEnrichmentJob.state(record)).toEqual({
      status: 'processing',
      startedAt: START,
      error: 'earlier',
      jobToken: 'tok',
      progress,
    });
  });

  // The callback revalidates no page, so a won claim has nothing to hand on.
  it('hands a won claim an empty context', () => {
    expect(videoEnrichmentJob.claimContext(record)).toEqual({});
  });

  it('answers on the enrichment callback and progress routes', () => {
    expect(videoEnrichmentJob.callbackPath(VIDEO_ID)).toBe(
      `/api/videos/${VIDEO_ID}/enrichment/callback`
    );
    expect(videoEnrichmentJob.progress?.path(VIDEO_ID)).toBe(
      `/api/videos/${VIDEO_ID}/enrichment/progress`
    );
  });

  it.each([
    [
      'marks pending; the repository stamps the start itself',
      () => videoEnrichmentJob.markPending(VIDEO_ID, START),
      VideoRepository.setEnrichmentStatus,
      [VIDEO_ID, 'pending'],
    ],
    [
      'begins with the conditional write',
      () => videoEnrichmentJob.begin(VIDEO_ID, START),
      VideoRepository.beginEnrichmentRun,
      [VIDEO_ID, START],
    ],
    [
      'stores the token',
      () => videoEnrichmentJob.setToken(VIDEO_ID, 'tok'),
      VideoRepository.setEnrichmentJobToken,
      [VIDEO_ID, 'tok'],
    ],
    [
      'claims the token',
      () => videoEnrichmentJob.claimToken(VIDEO_ID, 'tok'),
      VideoRepository.claimEnrichmentJobToken,
      [VIDEO_ID, 'tok'],
    ],
    [
      'records failed with its error',
      () => videoEnrichmentJob.recordFailed(VIDEO_ID, 'boom'),
      VideoRepository.setEnrichmentStatus,
      [VIDEO_ID, 'failed', { error: 'boom' }],
    ],
    [
      'records succeeded with a cleared error',
      () => videoEnrichmentJob.recordSucceeded(VIDEO_ID, undefined),
      VideoRepository.setEnrichmentStatus,
      [VIDEO_ID, 'succeeded', { error: null }],
    ],
    [
      'writes a checkpoint to the enrichment progress column',
      () => videoEnrichmentJob.progress?.write(VIDEO_ID, { stage: 'wikidata', at: progress.at }),
      VideoRepository.setEnrichmentProgress,
      [VIDEO_ID, { stage: 'wikidata', at: progress.at }],
    ],
  ])('%s', async (_name, write, repositoryMethod, args) => {
    await write();

    expect(vi.mocked(repositoryMethod).mock.calls).toEqual([args]);
  });

  it('keeps its copy byte-identical', () => {
    expect(videoEnrichmentJob.copy).toEqual({
      notFound: 'Video not found.',
      noCallbackUrl: 'Video enrichment callback URL is not configured',
      notConfigured: 'Video enrichment is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
      unreachable: 'Failed to reach the enrichment generator',
      runFailed: 'Video enrichment failed unexpectedly.',
      persistFailed: 'Video enrichment persistence failed.',
    });
  });
});

describe('videoEnrichmentJob.fake', () => {
  const payload = (category: 'MUSIC' | 'INFORMATIONAL') => ({
    task: 'video-enrichment' as const,
    videoId: VIDEO_ID,
    title: 'Bite Through Stone',
    artistDisplay: 'Ceschi',
    category,
    artists: [
      { artistId: ARTIST_ID, name: 'Ceschi', role: 'primary' as const },
      { artistId: OTHER_ID, name: 'Sole', role: 'featured' as const },
    ],
    callbackUrl: `https://example.com/api/videos/${VIDEO_ID}/enrichment/callback`,
    progressUrl: `https://example.com/api/videos/${VIDEO_ID}/enrichment/progress`,
    jobToken: 'tok',
    signingKey: 'k'.repeat(64),
  });

  it.each([
    ['MUSIC', 'musicbrainz'],
    ['INFORMATIONAL', 'web-search'],
  ] as const)(
    '%s: checkpoints the first stage the Lambda posts, as a valid progress POST',
    (category, stage) => {
      const checkpoint = videoEnrichmentJob.fake.checkpoint?.(payload(category));

      expect(checkpoint).toEqual({ stage, counts: { artists: 2 } });
      expect(
        videoEnrichmentProgressPostSchema.safeParse({ jobToken: 'tok', ...checkpoint }).success
      ).toBe(true);
    }
  );

  it.each(['MUSIC', 'INFORMATIONAL'] as const)(
    '%s: answers with the category fixture as a valid callback',
    (category) => {
      const result = videoEnrichmentJob.fake.result(payload(category));

      expect(result).toEqual({
        ok: true,
        data: videoEnrichmentFixture({
          artists: [{ artistId: ARTIST_ID }, { artistId: OTHER_ID }],
          category,
          title: 'Bite Through Stone',
        }),
      });
      expect(videoEnrichmentCallbackSchema.safeParse({ jobToken: 'tok', result }).success).toBe(
        true
      );
    }
  );

  it('dwells four seconds by default', () => {
    expect(videoEnrichmentJob.fake.delayMs).toBe(4000);
  });
});

describe('getEnrichmentStatus', () => {
  it('returns null for a missing video', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result).toBeNull();
  });

  it('reports an empty currentReleasedOn for a draft without a release date', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ releasedOn: null })
    );
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.currentReleasedOn).toBe('');
  });

  it('assembles the wire shape with day-precision dates and suggestion rows', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({
        enrichmentStatus: 'succeeded',
        enrichedAt: new Date('2026-07-12T01:02:03.000Z'),
      })
    );
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: null,
          firstName: 'Francisco',
          middleName: null,
          surname: 'Ramos',
          akaNames: null,
          bornOn: new Date('1980-01-02T00:00:00.000Z'),
        },
      }),
    ]);
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
      {
        id: 'c'.repeat(24),
        videoId: VIDEO_ID,
        artistId: ARTIST_ID,
        field: 'bornOn',
        value: '1985-03-15',
        confidence: 'high',
        sources: [{ url: 'https://musicbrainz.org/artist/x' }],
        note: null,
        status: 'pending',
        appliedAt: null,
        appliedBy: null,
        createdAt: new Date(),
      },
    ]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result).toEqual({
      status: 'succeeded',
      error: null,
      progress: null,
      enrichedAt: '2026-07-12T01:02:03.000Z',
      currentReleasedOn: '2021-04-09',
      artists: [
        {
          artistId: ARTIST_ID,
          displayName: 'Francisco Ramos',
          role: 'PRIMARY',
          current: {
            firstName: 'Francisco',
            middleName: null,
            surname: 'Ramos',
            akaNames: null,
            displayName: null,
            bornOn: '1980-01-02',
          },
        },
      ],
      suggestions: [
        {
          id: 'c'.repeat(24),
          artistId: ARTIST_ID,
          field: 'bornOn',
          value: '1985-03-15',
          confidence: 'high',
          sources: [{ url: 'https://musicbrainz.org/artist/x' }],
          note: null,
          status: 'pending',
        },
      ],
    });
  });

  it('degrades malformed stored sources to an empty list', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded' })
    );
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
      {
        id: 'c'.repeat(24),
        videoId: VIDEO_ID,
        artistId: ARTIST_ID,
        field: 'bornOn',
        value: '1985-03-15',
        confidence: 'high',
        sources: 'garbage',
        note: null,
        status: 'pending',
        appliedAt: null,
        appliedBy: null,
        createdAt: new Date(),
      },
    ]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.suggestions[0].sources).toEqual([]);
  });

  /** A well-formed stored suggestion row, overridable one field at a time. */
  const storedSuggestion = (
    overrides: Partial<VideoEnrichmentSuggestionRecord> = {}
  ): VideoEnrichmentSuggestionRecord => ({
    id: 'c'.repeat(24),
    videoId: VIDEO_ID,
    artistId: ARTIST_ID,
    field: 'bornOn',
    value: '1985-03-15',
    confidence: 'high',
    sources: [{ url: 'https://musicbrainz.org/artist/x' }],
    note: null,
    status: 'pending',
    appliedAt: null,
    appliedBy: null,
    createdAt: new Date(),
    ...overrides,
  });

  it('surfaces the stored checkpoint while the job is still processing', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({
        enrichmentStatus: 'processing',
        enrichmentStartedAt: new Date(),
        enrichmentProgress: {
          stage: 'wikidata',
          counts: { artists: 2 },
          at: '2026-07-19T12:00:00.000Z',
        },
      })
    );

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.progress).toEqual({
      stage: 'wikidata',
      counts: { artists: 2 },
      at: '2026-07-19T12:00:00.000Z',
    });
  });

  it('reports a null birth date for an artist with none stored', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded' })
    );
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.artists[0].current.bornOn).toBeNull();
  });

  it('omits a stored suggestion whose field is not a suggestable field', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded' })
    );
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
      storedSuggestion({ field: 'hometown' }),
    ]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.suggestions).toEqual([]);
  });

  it('omits a stored suggestion whose confidence is outside the rubric', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded' })
    );
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
      storedSuggestion({ confidence: 'certain' }),
    ]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.suggestions).toEqual([]);
  });

  it('omits a stored suggestion whose status is not a review state', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded' })
    );
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
      storedSuggestion({ status: 'superseded' }),
    ]);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.suggestions).toEqual([]);
  });
});

describe('videoEnrichmentJob.persist', () => {
  /** Persists an ok callback result's data, as the job runner's completion does. */
  const persist = async (result: VideoEnrichmentResult): Promise<void> => {
    if (!result.ok) throw new Error('persist takes an ok result');
    await videoEnrichmentJob.persist(VIDEO_ID, result.data, {});
  };

  const okResult = (suggestionValue: string) => ({
    ok: true as const,
    data: {
      artists: [
        {
          artistId: ARTIST_ID,
          suggestions: [
            {
              field: 'bornOn' as const,
              value: suggestionValue,
              confidence: 'high' as const,
              sources: [{ url: 'https://musicbrainz.org/artist/x' }],
            },
          ],
        },
      ],
      model: 'gemini-2.5-flash',
    },
  });

  beforeEach(() => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
  });

  it('persists new facts as pending', async () => {
    await persist(okResult('1985-03-15'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      {
        artistId: ARTIST_ID,
        field: 'bornOn',
        value: '1985-03-15',
        confidence: 'high',
        sources: [{ url: 'https://musicbrainz.org/artist/x' }],
        note: null,
      },
    ]);
  });

  it('drops a suggestion equal to the current value at day precision', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: 'Ceschi',
          firstName: 'Francisco',
          middleName: null,
          surname: 'Ramos',
          akaNames: null,
          bornOn: new Date('1985-03-15T00:00:00.000Z'),
        },
      }),
    ]);

    await persist(okResult('1985-03-15'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('fences a fact already applied or dismissed', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([
      { artistId: ARTIST_ID, field: 'bornOn', value: '1985-03-15' },
    ]);

    await persist(okResult('1985-03-15'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('pre-merges an akaNames suggestion with the existing comma list', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: 'Ceschi',
          firstName: 'Francisco',
          middleName: null,
          surname: 'Ramos',
          akaNames: 'Ceschi Ramos',
          bornOn: null,
        },
      }),
    ]);

    await persist({
      ok: true,
      data: {
        artists: [
          {
            artistId: ARTIST_ID,
            suggestions: [
              {
                field: 'akaNames',
                value: 'Ceschi Ramos, Francisco the Man',
                confidence: 'medium',
                sources: [{ url: 'https://musicbrainz.org/artist/x' }],
              },
            ],
          },
        ],
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({
        field: 'akaNames',
        value: 'Ceschi Ramos, Francisco the Man',
      }),
    ]);
  });

  it('emits the release-date suggestion only when it differs from the admin date', async () => {
    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          releasedOn: {
            value: '2021-04-09',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('persists a differing release date as a video-level suggestion', async () => {
    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          releasedOn: {
            value: '2020-06-01',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({ artistId: null, field: 'releasedOn', value: '2020-06-01' }),
    ]);
  });

  // ADR-0004: a release-date suggestion fills only an empty release date, by
  // itself — here, at enrichment time, with no form open.
  it('fills an empty release date from the suggestion and records it as applied', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValueOnce(
      baseState({ releasedOn: null })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          releasedOn: {
            value: '2021-04-09',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(vi.mocked(VideoRepository.update).mock.calls).toEqual([
      [VIDEO_ID, { releasedOn: new Date('2021-04-09T00:00:00.000Z') }],
    ]);
    expect(VideoEnrichmentSuggestionRepository.createApplied).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ artistId: null, field: 'releasedOn', value: '2021-04-09' })
    );
    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it("leaves today's UTC day pending for review — today never appears by itself", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValueOnce(
      baseState({ releasedOn: null })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          releasedOn: {
            value: '2026-10-01',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });
    vi.useRealTimers();

    expect(VideoRepository.update).not.toHaveBeenCalled();
    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({ artistId: null, field: 'releasedOn', value: '2026-10-01' }),
    ]);
  });

  it('drops a release-date suggestion that is not a calendar day', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValueOnce(
      baseState({ releasedOn: null })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          releasedOn: {
            value: 'spring 2021',
            confidence: 'low',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoRepository.update).not.toHaveBeenCalled();
    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('persists description and featuredArtist rows from the callback', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
    // A stored description keeps the fresh one as a reviewable pending row
    // (auto-apply only ever fills a blank description).
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ description: 'The admin wrote this earlier.' })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: 'A fresh synthesized description of the track.',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
          featuredArtists: [
            {
              value: 'New Name',
              confidence: 'medium',
              sources: [{ url: 'https://musicbrainz.org/artist/y' }],
            },
          ],
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({
        artistId: null,
        field: 'description',
        value: 'A fresh synthesized description of the track.',
      }),
      expect.objectContaining({ artistId: null, field: 'featuredArtist', value: 'New Name' }),
    ]);
  });

  it('auto-applies the description to a video without one', async () => {
    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: 'Fresh prose naming the artist.',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/review' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoRepository.update).toHaveBeenCalledWith(VIDEO_ID, {
      description: 'Fresh prose naming the artist.',
    });
    expect(VideoEnrichmentSuggestionRepository.createApplied).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({
        artistId: null,
        field: 'description',
        value: 'Fresh prose naming the artist.',
      })
    );
    // The applied row never enters the pending batch.
    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('treats a whitespace-only stored description as blank for auto-apply', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ description: '   ' })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: 'Fresh prose naming the artist.',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/review' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoRepository.update).toHaveBeenCalledWith(VIDEO_ID, {
      description: 'Fresh prose naming the artist.',
    });
  });

  it('never auto-applies over an existing description', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ description: 'Handwritten by the admin.' })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: 'Fresh prose naming the artist.',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/review' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoRepository.update).not.toHaveBeenCalled();
    expect(VideoEnrichmentSuggestionRepository.createApplied).not.toHaveBeenCalled();
    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({ field: 'description', value: 'Fresh prose naming the artist.' }),
    ]);
  });

  it('lets a failed auto-apply description write reach the job runner', async () => {
    // Once-mock: tests shuffle within the file and clearMocks does not reset
    // implementations, so a persistent rejection would poison other tests.
    vi.mocked(VideoRepository.update).mockRejectedValueOnce(new Error('db down'));

    await expect(
      persist({
        ok: true,
        data: {
          artists: [],
          video: {
            description: {
              value: 'Fresh prose naming the artist.',
              confidence: 'medium',
              sources: [{ url: 'https://example.com/review' }],
            },
          },
          model: 'gemini-2.5-flash',
        },
      })
    ).rejects.toThrow('db down');
  });

  it('drops a description equal to the stored one (case-insensitive)', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ description: 'An Existing Description.' })
    );

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: 'AN EXISTING DESCRIPTION.',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops featured artists already linked or already in the artist string', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([
      { name: 'Ceschi', role: 'primary' },
      { name: 'Sole', role: 'featured' },
    ]);
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: 'Buck 65',
          firstName: 'Rich',
          middleName: null,
          surname: 'Terfry',
          akaNames: null,
          bornOn: null,
        },
      }),
    ]);

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          featuredArtists: [
            { value: 'Buck 65', confidence: 'medium', sources: [] }, // already linked
            { value: 'sole', confidence: 'medium', sources: [] }, // already in artist string
            {
              value: 'New Guest',
              confidence: 'medium',
              sources: [{ url: 'https://musicbrainz.org/artist/y' }],
            },
          ],
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({ artistId: null, field: 'featuredArtist', value: 'New Guest' }),
    ]);
  });

  it('fences previously applied/dismissed video-level facts', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
    vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([
      { artistId: null, field: 'description', value: 'A synthesized description.' },
      { artistId: null, field: 'featuredArtist', value: 'New Name' },
    ]);

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: 'A synthesized description.',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
          featuredArtists: [
            {
              value: 'New Name',
              confidence: 'medium',
              sources: [{ url: 'https://musicbrainz.org/artist/y' }],
            },
          ],
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('lets a persistence error reach the job runner', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockRejectedValueOnce(
      new Error('db down')
    );

    await expect(persist(okResult('1985-03-15'))).rejects.toThrow('db down');
  });

  /** One artist-scoped suggestion, for the filtering/fencing cases. */
  const artistFact = (
    field: VideoSuggestionField,
    value: string,
    artistId: string = ARTIST_ID
  ): VideoEnrichmentResult => ({
    ok: true,
    data: {
      artists: [
        {
          artistId,
          suggestions: [
            {
              field,
              value,
              confidence: 'medium',
              sources: [{ url: 'https://musicbrainz.org/artist/x' }],
            },
          ],
        },
      ],
      model: 'gemini-2.5-flash',
    },
  });

  it('persists nothing when the video disappeared before the callback landed', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    await persist(okResult('1985-03-15'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).not.toHaveBeenCalled();
  });

  it('ignores a video-level field misfiled at artist scope', async () => {
    await persist(artistFact('releasedOn', '2020-06-01'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops an artist suggestion whose value is only whitespace', async () => {
    await persist(artistFact('firstName', '   '));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('ignores suggestions for an artist no longer linked to the video', async () => {
    await persist(artistFact('firstName', 'Timothy', OTHER_ID));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a first name that differs from the current one only by case', async () => {
    await persist(artistFact('firstName', 'FRANCISCO'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a surname that differs from the current one only by case', async () => {
    await persist(artistFact('surname', 'ramos'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a display name that differs from the current one only by case', async () => {
    await persist(artistFact('displayName', 'CESCHI'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a middle name that differs from the current one only by surrounding space', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({
        artist: {
          displayName: 'Ceschi',
          firstName: 'Francisco',
          middleName: 'Xavier',
          surname: 'Ramos',
          akaNames: null,
          bornOn: null,
        },
      }),
    ]);

    await persist(artistFact('middleName', '  Xavier  '));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('keeps a first name that genuinely differs from the current one', async () => {
    await persist(artistFact('firstName', 'Franco'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({ artistId: ARTIST_ID, field: 'firstName', value: 'Franco' }),
    ]);
  });

  it('fences a release date already applied or dismissed', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([
      { artistId: null, field: 'releasedOn', value: '2020-06-01' },
    ]);

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          releasedOn: {
            value: '2020-06-01',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a description that is only whitespace', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);

    await persist({
      ok: true,
      data: {
        artists: [],
        video: {
          description: {
            value: '   ',
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
        model: 'gemini-2.5-flash',
      },
    });

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });
});
