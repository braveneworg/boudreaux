/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { videoEnrichmentDataSchema } from '@/lib/validation/video-enrichment-schema';
import { extractProbePrefillTags } from '@/lib/video-probe/probe-tags';

import { videoEnrichmentFixture, videoProbeFixture } from './video-enrichment-fixture';

const ARTIST_ID = 'a'.repeat(24);
const OTHER_ID = 'b'.repeat(24);

describe('videoProbeFixture', () => {
  it('describes a deterministic 1080p h264/aac mp4', () => {
    expect(videoProbeFixture.normalized).toMatchObject({
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
    });
  });

  it('keeps the raw probeData filename as a bare s3 key (no presigned URL)', () => {
    expect(JSON.stringify(videoProbeFixture.probeData)).not.toContain('X-Amz-');
  });

  it('yields deterministic prefill tags for the admin form', () => {
    expect(extractProbePrefillTags(videoProbeFixture.probeData)).toEqual({
      title: 'E2E Probe Title',
      artist: 'E2E Probe Artist',
      releasedOn: '2019-08-01',
      description: 'E2E probe description',
      durationSeconds: 245,
    });
  });
});

describe('videoEnrichmentFixture', () => {
  it('validates against the enrichment data schema', () => {
    const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(videoEnrichmentDataSchema.safeParse(data).success).toBe(true);
  });

  it('emits a high-confidence bornOn and a medium akaNames per artist', () => {
    const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(data.artists[0].suggestions).toEqual([
      expect.objectContaining({ field: 'bornOn', value: '1985-03-15', confidence: 'high' }),
      expect.objectContaining({ field: 'akaNames', value: 'E2E Alias', confidence: 'medium' }),
    ]);
  });

  it('emits one fixture row set per supplied artist', () => {
    const data = videoEnrichmentFixture({
      artists: [{ artistId: ARTIST_ID }, { artistId: OTHER_ID }],
    });

    expect(data.artists.map(({ artistId }) => artistId)).toEqual([ARTIST_ID, OTHER_ID]);
  });

  it('emits a medium-confidence video release date of 2020-06-01', () => {
    const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(data.video?.releasedOn).toMatchObject({ value: '2020-06-01', confidence: 'medium' });
  });

  it('is deterministic across calls', () => {
    const a = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });
    const b = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(a).toEqual(b);
  });
});
