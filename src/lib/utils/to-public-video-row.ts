/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Video } from '@/lib/types/domain/video';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

/**
 * Video fields that never leave the server on the listing payloads: the audit
 * ObjectIds plus every probe/enrichment internal. Probe display fields are
 * admin-detail-only; job state and raw probe JSON are never on any wire.
 *
 * Declared as an exhaustive `Omit<Video, VideoInternalField>` (below) with NO
 * index signature so that a future new internal `Video` field forces a compile
 * error here — the whole point of the single canonical stripper.
 */
type VideoInternalField =
  | 'createdBy'
  | 'updatedBy'
  | 'probedAt'
  | 'probeError'
  | 'container'
  | 'width'
  | 'height'
  | 'videoCodec'
  | 'audioCodec'
  | 'bitrateKbps'
  | 'frameRate'
  | 'audioChannels'
  | 'audioSampleRateHz'
  | 'colorSpace'
  | 'colorPrimaries'
  | 'colorTransfer'
  | 'sourceCreatedAt'
  | 'encoder'
  | 'probeData'
  | 'enrichmentStatus'
  | 'enrichmentError'
  | 'enrichmentStartedAt'
  | 'enrichmentJobToken'
  | 'enrichmentProgress'
  | 'enrichedAt';

/**
 * A public video row: the internal audit/probe/enrichment fields are dropped,
 * with the runtime-only, per-request signed stream URL attached. The canonical
 * shape shared by the `/api/videos` listing route and the `/videos` SSR
 * prefetch so both serialize the exact same fields.
 */
export type VideoRowWithStream = Omit<Video, VideoInternalField> & { streamUrl: string | null };

/**
 * Strip the internal audit/probe/enrichment fields from one `Video` and attach
 * its per-request signed stream URL. The single canonical stripper — both the
 * listing API route and the SSR page prefetch route their rows through this so
 * the `enrichmentJobToken` callback secret and raw `probeData` never reach any
 * client (response body or dehydrated React-Query cache in the page HTML).
 */
export const toPublicVideoRow = ({
  createdBy: _createdBy,
  updatedBy: _updatedBy,
  probedAt: _probedAt,
  probeError: _probeError,
  container: _container,
  width: _width,
  height: _height,
  videoCodec: _videoCodec,
  audioCodec: _audioCodec,
  bitrateKbps: _bitrateKbps,
  frameRate: _frameRate,
  audioChannels: _audioChannels,
  audioSampleRateHz: _audioSampleRateHz,
  colorSpace: _colorSpace,
  colorPrimaries: _colorPrimaries,
  colorTransfer: _colorTransfer,
  sourceCreatedAt: _sourceCreatedAt,
  encoder: _encoder,
  probeData: _probeData,
  enrichmentStatus: _enrichmentStatus,
  enrichmentError: _enrichmentError,
  enrichmentStartedAt: _enrichmentStartedAt,
  enrichmentJobToken: _enrichmentJobToken,
  enrichmentProgress: _enrichmentProgress,
  enrichedAt: _enrichedAt,
  ...video
}: Video): VideoRowWithStream => ({
  ...video,
  streamUrl: signStreamUrl(video.s3Key),
});
