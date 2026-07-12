/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Video } from '@/lib/types/domain/video';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

/**
 * Fields stripped from EVERY video wire payload, admin included: the per-job
 * callback secret, the transient progress checkpoint, and the raw (large) probe
 * JSON. These never leave the server on any route — see {@link toAdminVideoDetailRow}.
 */
type VideoSecretField = 'probeData' | 'enrichmentJobToken' | 'enrichmentProgress';

/**
 * Fields additionally stripped from the PUBLIC listing payloads but KEPT on the
 * admin detail payload (which renders them): the audit ObjectIds, the normalized
 * probe display columns, and enrichment job-state.
 */
type VideoListingOnlyInternalField =
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
  | 'enrichmentStatus'
  | 'enrichmentError'
  | 'enrichmentStartedAt'
  | 'enrichedAt';

/**
 * Every field that never leaves the server on the listing payloads: the secret
 * set plus the audit/probe/enrichment internals. Composing it from
 * {@link VideoSecretField} makes `VideoSecretField ⊆ VideoInternalField` hold
 * structurally, so the two strippers share one source of truth for the
 * always-internal fields.
 *
 * Declared as an exhaustive `Omit<Video, VideoInternalField>` (below) with NO
 * index signature so that a future new internal `Video` field forces a compile
 * error here — the whole point of the single canonical stripper.
 */
type VideoInternalField = VideoSecretField | VideoListingOnlyInternalField;

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

/**
 * An admin video detail row: only the always-internal secret fields are dropped
 * (the callback token, progress checkpoint, and raw probe JSON), with the
 * per-request signed stream URL attached. Unlike {@link VideoRowWithStream}, the
 * normalized probe columns, enrichment job-state, and audit ObjectIds are KEPT —
 * the admin edit page renders them.
 */
export type VideoDetailRowWithStream = Omit<Video, VideoSecretField> & {
  streamUrl: string | null;
};

/**
 * Strip only the always-internal secret fields from one `Video` and attach its
 * per-request signed stream URL, for the admin-only `/api/videos/[id]` detail
 * route. Shares {@link VideoSecretField} with {@link toPublicVideoRow} so the
 * `enrichmentJobToken` callback secret and raw `probeData` can never reach a
 * client from either route, while the admin edit page still receives the
 * normalized probe columns and enrichment job-state it renders.
 */
export const toAdminVideoDetailRow = ({
  probeData: _probeData,
  enrichmentJobToken: _enrichmentJobToken,
  enrichmentProgress: _enrichmentProgress,
  ...video
}: Video): VideoDetailRowWithStream => ({
  ...video,
  streamUrl: signStreamUrl(video.s3Key),
});
