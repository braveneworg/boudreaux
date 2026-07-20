/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { videoEnrichmentDataSchema } from '@/lib/validation/video-enrichment-schema';
import { normalizeProbe } from '@/lib/video-probe/normalize';
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

  /**
   * The fixture is raw ffprobe output now, so it carries the presigned URL that
   * `redactProbeJson` exists to strip. Asserting it is *present* here is the
   * point: it is what gives the redaction step something real to do on the fake
   * path. See the service spec for the assertion that it does not survive.
   */
  it('echoes the probe URL back as the filename, the way ffprobe does', () => {
    const raw = videoProbeFixture.raw('https://example.com/x.mp4?X-Amz-Signature=abc');

    expect(JSON.stringify(raw)).toContain('X-Amz-Signature=abc');
  });

  /**
   * The E2E seed hand-writes these same scalars and a comment says they "MUST
   * equal videoProbeFixture.normalized". This is that comment, enforced: if the
   * raw fixture and the normalized fixture ever disagree, the fake path would
   * silently persist different values than the seed on the first re-probe.
   */
  it('normalizes its own raw output to the declared scalars', () => {
    expect(normalizeProbe(videoProbeFixture.raw('https://example.com/x.mp4'))).toEqual(
      videoProbeFixture.normalized
    );
  });

  it('yields deterministic prefill tags for the admin form', () => {
    expect(extractProbePrefillTags(videoProbeFixture.raw('https://example.com/x.mp4'))).toEqual({
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

  it('emits the deterministic video-level description', () => {
    const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(data.video?.description).toMatchObject({
      value: 'A deterministic E2E description of the track, its artists, and its release context.',
      confidence: 'medium',
    });
  });

  it('emits one discovered featured artist', () => {
    const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(data.video?.featuredArtists).toEqual([
      expect.objectContaining({ value: 'E2E Discovered Feature', confidence: 'medium' }),
    ]);
  });

  it('is deterministic across calls', () => {
    const a = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });
    const b = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

    expect(a).toEqual(b);
  });
});
