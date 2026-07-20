/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { videoProbeFixture } from '@/lib/services/video-enrichment-fixture';
import type { ProbeUrlResult } from '@/lib/video-probe/ffprobe';

/**
 * Local stand-ins for the two things a probe genuinely cannot do without AWS
 * and a media file: sign an S3 URL, and spawn ffprobe against it.
 *
 * These sit as low as the seam allows. Everything downstream of them —
 * `normalizeProbe`, `redactProbeJson`, the failure-persist branch, the
 * stale-file-race check — runs for real on the fake path, because the fake
 * hands back the same shapes the real adapters do rather than skipping ahead
 * to a finished result.
 */

/**
 * A presigned GET that looks like the real thing, credentials included.
 *
 * The query string matters: `redactProbeJson` exists to strip exactly this out
 * of ffprobe's echoed `format.filename` before it is persisted. A fake URL
 * without an `X-Amz-` signature would let a redaction regression through
 * unnoticed, which is precisely what the old service-level fake did.
 */
export const buildLocalProbeUrl = (s3Key: string): string =>
  `https://e2e-bucket.s3.amazonaws.com/${s3Key}` +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
  '&X-Amz-Credential=E2EFAKEKEYID%2F20200530%2Fus-east-1%2Fs3%2Faws4_request' +
  '&X-Amz-Date=20200530T120000Z' +
  '&X-Amz-Expires=120' +
  '&X-Amz-SignedHeaders=host' +
  '&X-Amz-Signature=0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Stands in for the ffprobe spawn, returning the fixture's raw
 * `-show_format -show_streams` JSON.
 *
 * Echoes `url` back as `format.filename` because that is what ffprobe does —
 * and that echo is the whole reason redaction exists.
 */
export const probeLocally = (url: string): ProbeUrlResult => ({
  ok: true,
  raw: videoProbeFixture.raw(url),
});
