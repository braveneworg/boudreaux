/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { VideoEnrichmentData } from '@/lib/validation/video-enrichment-schema';
import type { NormalizedProbe } from '@/lib/video-probe/normalize';

/**
 * Deterministic ffprobe result used when `BIO_GENERATOR_FAKE=true` (E2E and
 * local dev without ffprobe/S3). A plain 1080p h264/aac MP4; the raw
 * `probeData` filename is a bare s3Key — never a presigned URL — mirroring the
 * production redaction contract (no `X-Amz-` substring may survive).
 */
export const videoProbeFixture: { normalized: NormalizedProbe; probeData: unknown } = {
  normalized: {
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    width: 1920,
    height: 1080,
    videoCodec: 'h264',
    audioCodec: 'aac',
    bitrateKbps: 4800,
    frameRate: 23.976,
    audioChannels: 2,
    audioSampleRateHz: 48000,
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    sourceCreatedAt: new Date('2020-05-30T12:00:00.000Z'),
    encoder: 'Lavf60.16.100',
  },
  probeData: {
    format: {
      filename: 'media/videos/e2e-fixture.mp4',
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: '245.000000',
      bit_rate: '4800000',
      tags: {
        encoder: 'Lavf60.16.100',
        creation_time: '2020-05-30T12:00:00.000000Z',
        title: 'E2E Probe Title',
        artist: 'E2E Probe Artist',
        date: '2019-08-01',
        comment: 'E2E probe description',
      },
    },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        r_frame_rate: '24000/1001',
        color_space: 'bt709',
        color_primaries: 'bt709',
        color_transfer: 'bt709',
      },
      { codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000' },
    ],
  },
};

/** The deterministic sources every fixture suggestion cites. */
const FIXTURE_MB_SOURCE = {
  url: 'https://musicbrainz.org/artist/e2e-fixture',
  label: 'MusicBrainz',
} as const;
const FIXTURE_WD_SOURCE = { url: 'https://www.wikidata.org/wiki/Q0', label: 'Wikidata' } as const;

/**
 * Deterministic enrichment result used when `BIO_GENERATOR_FAKE=true`. Emits,
 * per artist: a high-confidence bornOn (1985-03-15) and a medium-confidence
 * akaNames ('E2E Alias'); plus video-level facts (a medium-confidence release
 * date 2020-06-01, a synthesized description, and one discovered featured
 * artist 'E2E Discovered Feature') so E2E can assert the full run → suggest →
 * apply flow.
 */
export const videoEnrichmentFixture = (input: {
  artists: Array<{ artistId: string }>;
}): VideoEnrichmentData => ({
  artists: input.artists.map(({ artistId }) => ({
    artistId,
    suggestions: [
      {
        field: 'bornOn',
        value: '1985-03-15',
        confidence: 'high',
        sources: [FIXTURE_MB_SOURCE, FIXTURE_WD_SOURCE],
        note: 'Deterministic fixture fact (E2E).',
      },
      {
        field: 'akaNames',
        value: 'E2E Alias',
        confidence: 'medium',
        sources: [FIXTURE_MB_SOURCE],
        note: 'Deterministic fixture alias (E2E).',
      },
    ],
  })),
  video: {
    releasedOn: {
      value: '2020-06-01',
      confidence: 'medium',
      sources: [{ url: 'https://musicbrainz.org/release/e2e-fixture', label: 'MusicBrainz' }],
      note: 'Deterministic fixture release date (E2E).',
    },
    description: {
      value: 'A deterministic E2E description of the track, its artists, and its release context.',
      confidence: 'medium',
      sources: [FIXTURE_MB_SOURCE],
      note: 'Deterministic fixture description (E2E).',
    },
    featuredArtists: [
      {
        value: 'E2E Discovered Feature',
        confidence: 'medium',
        sources: [FIXTURE_MB_SOURCE],
        note: 'Deterministic fixture featured artist (E2E).',
      },
    ],
  },
  model: 'fake/deterministic',
});
