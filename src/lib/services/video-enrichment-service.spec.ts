/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';
import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';
import { ArtistService } from '@/lib/services/artist-service';
import type {
  VideoEnrichmentState,
  VideoEnrichmentSuggestionRecord,
} from '@/lib/types/domain/video-enrichment';
import type {
  VideoEnrichmentResult,
  VideoSuggestionField,
} from '@/lib/validation/video-enrichment-schema';
import { splitFeaturedArtists } from '@/utils/artist-name-split';

import { VideoEnrichmentService } from './video-enrichment-service';

vi.mock('server-only', () => ({}));

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = sendMock;
  },
  InvokeCommand: class {
    constructor(
      readonly input: { FunctionName?: string; InvocationType?: string; Payload?: Uint8Array }
    ) {}
  },
}));
vi.mock('@smithy/node-http-handler', () => ({ NodeHttpHandler: class {} }));

vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: {
    getEnrichmentState: vi.fn(),
    setEnrichmentStatus: vi.fn(),
    setEnrichmentJobToken: vi.fn(),
    claimEnrichmentJobToken: vi.fn(),
    setEnrichmentProgress: vi.fn(),
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

/** The InvokeCommand payload sent to the mocked Lambda client, parsed. */
const sentPayload = (): Record<string, unknown> => {
  const command = sendMock.mock.calls[0][0] as { input: { Payload: Uint8Array } };
  return JSON.parse(Buffer.from(command.input.Payload).toString('utf8'));
};

beforeEach(() => {
  vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'bio-fn');
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
  vi.stubEnv('BIO_GENERATOR_FAKE', 'false');
  // Neutralize the fake-path dwell so fake-path tests never wait a real timer.
  vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '0');
  vi.mocked(VideoRepository.setEnrichmentStatus).mockResolvedValue(undefined);
  vi.mocked(VideoRepository.setEnrichmentJobToken).mockResolvedValue(undefined);
  vi.mocked(VideoRepository.setEnrichmentProgress).mockResolvedValue(undefined);
  vi.mocked(VideoArtistRepository.replaceForVideo).mockResolvedValue(undefined);
  vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);
  vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([]);
  vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([]);
  vi.mocked(VideoEnrichmentSuggestionRepository.deletePendingForArtists).mockResolvedValue(
    undefined
  );
  sendMock.mockResolvedValue({});
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
      .mockResolvedValueOnce({ success: false, error: 'db down' })
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
  it('does nothing for an INFORMATIONAL video', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ category: 'INFORMATIONAL' })
    );

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
  });

  it('refuses to double-dispatch while a processing job is fresh', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentStartedAt: new Date() })
    );

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('completes in-process from the fixture on the fake path', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.arrayContaining([
        expect.objectContaining({ artistId: ARTIST_ID, field: 'bornOn', value: '1985-03-15' }),
      ])
    );
    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'succeeded', {
      error: null,
    });
  });

  it('emits one synthetic progress checkpoint on the fake path', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentProgress).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.objectContaining({ stage: 'musicbrainz' })
    );
  });

  it('does not arm a timer on the fake path when the dwell is zero', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('dwells the configured fake delay before flipping to succeeded', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '4000');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
    vi.useFakeTimers();
    try {
      const promise = VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);
      // Let the synchronous prep + checkpoint microtasks settle; the run then
      // parks on the dwell timer, so no success flip has happened yet.
      await vi.advanceTimersByTimeAsync(0);
      expect(
        vi
          .mocked(VideoRepository.setEnrichmentStatus)
          .mock.calls.some(([, status]) => status === 'succeeded')
      ).toBe(false);

      await vi.advanceTimersByTimeAsync(4000);
      await promise;
      expect(
        vi
          .mocked(VideoRepository.setEnrichmentStatus)
          .mock.calls.some(([, status]) => status === 'succeeded')
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores a job token and fires an Event invoke with the callback URLs', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    const payload = sentPayload();
    const storedToken = vi.mocked(VideoRepository.setEnrichmentJobToken).mock.calls[0][1];
    expect(payload).toMatchObject({
      task: 'video-enrichment',
      videoId: VIDEO_ID,
      title: 'Bite Through Stone',
      artistDisplay: 'Ceschi',
      releasedOn: '2021-04-09',
      callbackUrl: `https://example.com/api/videos/${VIDEO_ID}/enrichment/callback`,
      progressUrl: `https://example.com/api/videos/${VIDEO_ID}/enrichment/progress`,
      jobToken: storedToken,
    });
  });

  it('sends the linked artists with their known identity fields', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
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

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sentPayload().artists).toEqual([
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

  it('fails the job and clears the token when the invoke throws', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
    sendMock.mockRejectedValue(new Error('network'));

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'Failed to reach the enrichment generator',
    });
    expect(VideoRepository.setEnrichmentJobToken).toHaveBeenLastCalledWith(VIDEO_ID, null);
  });

  it('fails the job when the base URL is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'Video enrichment callback URL is not configured',
    });
  });

  it('fails the job when the Lambda function name is unconfigured', async () => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', '');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'Video enrichment is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    });
  });

  it('fails the job when the video has no linked artists to enrich', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'No linked artists to enrich.',
    });
  });

  it('never fires an invoke when the video has no linked artists', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('maps a FEATURED join row onto the featured role in the payload', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
      artistRow({ role: 'FEATURED' }),
    ]);

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sentPayload().artists).toEqual([
      {
        artistId: ARTIST_ID,
        name: 'Ceschi',
        role: 'featured',
        known: { firstName: 'Francisco', surname: 'Ramos', displayName: 'Ceschi' },
      },
    ]);
  });

  it('omits the identity fields a mononym artist has left empty', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
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

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sentPayload().artists).toEqual([
      { artistId: ARTIST_ID, name: 'Sole', role: 'primary', known: { displayName: 'Sole' } },
    ]);
  });

  it('sends a middle name as part of the known identity block', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
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

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sentPayload().artists).toEqual([
      {
        artistId: ARTIST_ID,
        name: 'Francisco Ramos',
        role: 'primary',
        known: { firstName: 'Francisco', middleName: 'Xavier', surname: 'Ramos' },
      },
    ]);
  });

  it('omits the known block entirely for an artist shell with no identity fields', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
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

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(sentPayload().artists).toEqual([{ artistId: ARTIST_ID, name: '', role: 'primary' }]);
  });

  it('fails the job with the thrown message when the state read rejects', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockRejectedValue(new Error('db down'));

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'db down',
    });
  });

  it('fails the job with a generic message when the rejection is not an Error', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockRejectedValue('socket hang up');

    await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'Video enrichment failed unexpectedly.',
    });
  });

  it('falls back to the default 4s dwell when the delay override is not a number', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', 'not-a-number');
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
    vi.useFakeTimers();
    try {
      const promise = VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);
      // One millisecond short of the default dwell the run must still be parked.
      await vi.advanceTimersByTimeAsync(3999);
      expect(
        vi
          .mocked(VideoRepository.setEnrichmentStatus)
          .mock.calls.some(([, status]) => status === 'succeeded')
      ).toBe(false);

      // Drain the remaining dwell so the run settles before timers are restored.
      await vi.advanceTimersByTimeAsync(1);
      await promise;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getEnrichmentStatus', () => {
  it('returns null for a missing video', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result).toBeNull();
  });

  it('coerces a stale processing job to failed on read', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({
        enrichmentStatus: 'processing',
        enrichmentStartedAt: new Date(Date.now() - 18 * 60 * 1000),
      })
    );

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result).toMatchObject({
      status: 'failed',
      error: 'Video enrichment timed out. Please try again.',
    });
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

  it('reports no progress when the stored checkpoint is malformed', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({
        enrichmentStatus: 'processing',
        enrichmentStartedAt: new Date(),
        enrichmentProgress: { stage: 'not-a-stage' },
      })
    );

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.progress).toBeNull();
  });

  it('withholds progress once the job has left the in-flight states', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({
        enrichmentStatus: 'succeeded',
        enrichmentProgress: {
          stage: 'finalizing',
          counts: { artists: 2 },
          at: '2026-07-19T12:00:00.000Z',
        },
      })
    );

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.progress).toBeNull();
  });

  it('reads a stored status outside the lifecycle union as never-enriched', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'archived' })
    );

    const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

    expect(result?.status).toBeNull();
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

describe('verifyAndClaimCallback', () => {
  it('returns false on a token mismatch without attempting the claim', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
    );

    const result = await VideoEnrichmentService.verifyAndClaimCallback(VIDEO_ID, 'forged');

    expect(result).toBe(false);
    expect(VideoRepository.claimEnrichmentJobToken).not.toHaveBeenCalled();
  });

  it('claims atomically when the token matches a processing job', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
    );
    vi.mocked(VideoRepository.claimEnrichmentJobToken).mockResolvedValue(true);

    const result = await VideoEnrichmentService.verifyAndClaimCallback(VIDEO_ID, 'stored');

    expect(result).toBe(true);
    expect(VideoRepository.claimEnrichmentJobToken).toHaveBeenCalledWith(VIDEO_ID, 'stored');
  });

  it('returns false without claiming when the video state is missing', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    const result = await VideoEnrichmentService.verifyAndClaimCallback(VIDEO_ID, 'stored');

    expect(result).toBe(false);
    expect(VideoRepository.claimEnrichmentJobToken).not.toHaveBeenCalled();
  });

  it('returns false without claiming when the job is not processing', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded', enrichmentJobToken: 'stored' })
    );

    const result = await VideoEnrichmentService.verifyAndClaimCallback(VIDEO_ID, 'stored');

    expect(result).toBe(false);
    expect(VideoRepository.claimEnrichmentJobToken).not.toHaveBeenCalled();
  });
});

describe('recordProgress', () => {
  it('stamps the checkpoint server-side when the token matches', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
    );

    await VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', {
      stage: 'wikidata',
      counts: { artists: 1 },
    });

    expect(VideoRepository.setEnrichmentProgress).toHaveBeenCalledWith(VIDEO_ID, {
      stage: 'wikidata',
      counts: { artists: 1 },
      at: expect.any(String),
    });
  });

  it('writes nothing when the job is not processing', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'succeeded', enrichmentJobToken: 'stored' })
    );

    await VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', { stage: 'wikidata' });

    expect(VideoRepository.setEnrichmentProgress).not.toHaveBeenCalled();
  });

  it('writes nothing when the token does not match', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
    );

    await VideoEnrichmentService.recordProgress(VIDEO_ID, 'forged', { stage: 'wikidata' });

    expect(VideoRepository.setEnrichmentProgress).not.toHaveBeenCalled();
  });

  it('writes nothing when the job has no stored token to verify against', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ enrichmentStatus: 'processing', enrichmentJobToken: null })
    );

    await VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', { stage: 'wikidata' });

    expect(VideoRepository.setEnrichmentProgress).not.toHaveBeenCalled();
  });

  it('writes nothing when the video no longer exists', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    await VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', { stage: 'wikidata' });

    expect(VideoRepository.setEnrichmentProgress).not.toHaveBeenCalled();
  });

  it('swallows a repository failure instead of throwing', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockRejectedValue(new Error('db down'));

    await expect(
      VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', { stage: 'wikidata' })
    ).resolves.toBeUndefined();

    expect(VideoRepository.setEnrichmentProgress).not.toHaveBeenCalled();
  });
});

describe('completeCallback', () => {
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

  it('flips to failed on an error result', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, { ok: false, error: 'boom' });

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenCalledWith(VIDEO_ID, 'failed', {
      error: 'boom',
    });
  });

  it('persists new facts as pending and flips to succeeded', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

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
    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'succeeded', {
      error: null,
    });
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

    await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('fences a fact already applied or dismissed', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([
      { artistId: ARTIST_ID, field: 'bornOn', value: '1985-03-15' },
    ]);

    await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

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

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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
    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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
    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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

  it('persists description and featuredArtist rows from the callback', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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

  it('drops a description equal to the stored one (case-insensitive)', async () => {
    vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
      baseState({ description: 'An Existing Description.' })
    );

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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

  it('flips to failed when persistence throws', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockRejectedValue(
      new Error('db down')
    );

    await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'db down',
    });
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

  it('flips to failed with a generic message when persistence rejects a non-Error', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockRejectedValue(
      'socket closed'
    );

    await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

    expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
      error: 'Video enrichment persistence failed.',
    });
  });

  it('persists nothing when the video disappeared before the callback landed', async () => {
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

    await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).not.toHaveBeenCalled();
  });

  it('ignores a video-level field misfiled at artist scope', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('releasedOn', '2020-06-01'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops an artist suggestion whose value is only whitespace', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('firstName', '   '));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('ignores suggestions for an artist no longer linked to the video', async () => {
    await VideoEnrichmentService.completeCallback(
      VIDEO_ID,
      artistFact('firstName', 'Timothy', OTHER_ID)
    );

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a first name that differs from the current one only by case', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('firstName', 'FRANCISCO'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a surname that differs from the current one only by case', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('surname', 'ramos'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('drops a display name that differs from the current one only by case', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('displayName', 'CESCHI'));

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

    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('middleName', '  Xavier  '));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
  });

  it('keeps a first name that genuinely differs from the current one', async () => {
    await VideoEnrichmentService.completeCallback(VIDEO_ID, artistFact('firstName', 'Franco'));

    expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
      expect.objectContaining({ artistId: ARTIST_ID, field: 'firstName', value: 'Franco' }),
    ]);
  });

  it('fences a release date already applied or dismissed', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([
      { artistId: null, field: 'releasedOn', value: '2020-06-01' },
    ]);

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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

    await VideoEnrichmentService.completeCallback(VIDEO_ID, {
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
