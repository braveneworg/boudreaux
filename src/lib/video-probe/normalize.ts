/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Normalized, display-ready subset of an ffprobe report (all fields nullable). */
export interface NormalizedProbe {
  container: string | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number | null;
  frameRate: number | null;
  audioChannels: number | null;
  audioSampleRateHz: number | null;
  colorSpace: string | null;
  colorPrimaries: string | null;
  colorTransfer: string | null;
  sourceCreatedAt: Date | null;
  encoder: string | null;
}

/** Raw probe JSON is capped at 256 KB serialized before it may be persisted. */
const MAX_PROBE_JSON_BYTES = 256 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/** Parse a positive numeric value or numeric string ("5000000"), else null. */
const parseNumeric = (value: unknown): number | null => {
  const parsed =
    typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Evaluate an ffprobe fraction: "30000/1001" → 29.97 (2dp); "0/0" and junk → null. */
const parseFrameRate = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const rate = numerator / denominator;
  return rate > 0 ? Math.round(rate * 100) / 100 : null;
};

/** bit_rate arrives in bits/s (usually a string) → whole kbps. */
const parseBitrateKbps = (value: unknown): number | null => {
  const bits = parseNumeric(value);
  return bits === null ? null : Math.round(bits / 1000);
};

/** sample_rate arrives as a string ("48000") → whole Hz. */
const parseSampleRateHz = (value: unknown): number | null => {
  const rate = parseNumeric(value);
  return rate === null ? null : Math.round(rate);
};

/** Parse an ISO-ish tag value ("2024-01-15T10:30:00.000000Z") to a Date, else null. */
const parseDateTag = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** First stream of the given codec_type, or null. */
const findStream = (
  root: Record<string, unknown>,
  codecType: string
): Record<string, unknown> | null => {
  const { streams } = root;
  if (!Array.isArray(streams)) return null;
  const match = streams.find(
    (stream: unknown) => isRecord(stream) && stream.codec_type === codecType
  );
  return isRecord(match) ? match : null;
};

/** The tags object of a format/stream node, or an empty object. */
const tagsOf = (node: Record<string, unknown> | null): Record<string, unknown> =>
  node !== null && isRecord(node.tags) ? node.tags : {};

/** Fields derived from the format node (container, bitrate, tags). */
const formatFields = (
  format: Record<string, unknown> | null,
  video: Record<string, unknown> | null
): Pick<NormalizedProbe, 'container' | 'bitrateKbps' | 'sourceCreatedAt' | 'encoder'> => {
  const tags = tagsOf(format);
  return {
    container: asString(format?.format_name),
    bitrateKbps: parseBitrateKbps(format?.bit_rate),
    sourceCreatedAt: parseDateTag(tags.creation_time ?? tags['com.apple.quicktime.creationdate']),
    encoder: asString(tags.encoder) ?? asString(tagsOf(video).encoder),
  };
};

/** Fields derived from the first video stream. */
const videoFields = (
  video: Record<string, unknown> | null
): Pick<
  NormalizedProbe,
  | 'width'
  | 'height'
  | 'videoCodec'
  | 'frameRate'
  | 'colorSpace'
  | 'colorPrimaries'
  | 'colorTransfer'
> => ({
  width: asInt(video?.width),
  height: asInt(video?.height),
  videoCodec: asString(video?.codec_name),
  frameRate: parseFrameRate(video?.avg_frame_rate),
  colorSpace: asString(video?.color_space),
  colorPrimaries: asString(video?.color_primaries),
  colorTransfer: asString(video?.color_transfer),
});

/** Fields derived from the first audio stream. */
const audioFields = (
  audio: Record<string, unknown> | null
): Pick<NormalizedProbe, 'audioCodec' | 'audioChannels' | 'audioSampleRateHz'> => ({
  audioCodec: asString(audio?.codec_name),
  audioChannels: asInt(audio?.channels),
  audioSampleRateHz: parseSampleRateHz(audio?.sample_rate),
});

/**
 * Normalize raw ffprobe JSON (`-show_format -show_streams`) into the display
 * fields persisted on `Video`. Fully defensive: any shape surprise degrades
 * the affected field to null instead of throwing.
 */
export const normalizeProbe = (raw: unknown): NormalizedProbe => {
  const root = isRecord(raw) ? raw : {};
  const format = isRecord(root.format) ? root.format : null;
  const video = findStream(root, 'video');
  const audio = findStream(root, 'audio');

  return {
    ...formatFields(format, video),
    ...videoFields(video),
    ...audioFields(audio),
  };
};

/** Serialized UTF-8 size of a JSON value. */
const byteLength = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** Remove every streams[i].side_data_list in place (the usual size offender). */
const dropSideDataLists = (root: Record<string, unknown>): void => {
  const { streams } = root;
  if (!Array.isArray(streams)) return;
  for (const stream of streams) {
    if (isRecord(stream)) delete stream.side_data_list;
  }
};

const AMZ_MARKER = 'X-Amz-';

/** An X-Amz token runs to the next delimiter that can end it inside a JSON string. */
const AMZ_TOKEN_PATTERN = /X-Amz-[^\s"'&\\]*/g;

/**
 * Terminal backstop: `format.filename` is the only documented echo point for
 * the probed URL, but some demuxers copy source URIs into nested metadata, so
 * the persisted payload as a whole must be proven free of `X-Amz-` material.
 */
const scrubAmzMaterial = (value: Record<string, unknown>): unknown => {
  const serialized = JSON.stringify(value);
  if (!serialized.includes(AMZ_MARKER)) return value;
  try {
    return JSON.parse(serialized.replace(AMZ_TOKEN_PATTERN, '')) as unknown;
  } catch {
    return { __truncated: true };
  }
};

/**
 * Prepare raw ffprobe JSON for persistence: deep-clone it, replace
 * `format.filename` (which echoes the credentialed presigned probe URL — no
 * `X-Amz-` material may survive) with the bare s3Key, scrub any residual
 * `X-Amz-` tokens elsewhere in the payload, and cap the serialized size at
 * 256 KB — first by dropping `streams[i].side_data_list`, then by degrading
 * to `{ __truncated: true }`.
 */
export const redactProbeJson = (raw: unknown, s3Key: string): unknown => {
  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(raw)) as unknown;
  } catch {
    return { __truncated: true };
  }
  if (!isRecord(clone)) return clone;

  if (isRecord(clone.format) && 'filename' in clone.format) {
    clone.format.filename = s3Key;
  }

  const scrubbed = scrubAmzMaterial(clone);
  if (!isRecord(scrubbed)) return { __truncated: true };

  if (byteLength(scrubbed) <= MAX_PROBE_JSON_BYTES) return scrubbed;
  dropSideDataLists(scrubbed);
  if (byteLength(scrubbed) <= MAX_PROBE_JSON_BYTES) return scrubbed;
  return { __truncated: true };
};
