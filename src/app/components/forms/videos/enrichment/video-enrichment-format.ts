/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Threshold above which a bitrate reads better in Mbps than kbps. */
const MBPS_THRESHOLD_KBPS = 1000;

/** Format probe dimensions as `1920×1080`; null when either side is unknown. */
export const formatResolution = (
  width: number | null | undefined,
  height: number | null | undefined
): string | null => (width != null && height != null ? `${width}×${height}` : null);

/** Format a kbps bitrate as `4.2 Mbps` (≥1000) or `320 kbps`; null when unknown. */
export const formatBitrate = (bitrateKbps: number | null | undefined): string | null => {
  if (bitrateKbps == null) return null;
  return bitrateKbps >= MBPS_THRESHOLD_KBPS
    ? `${(bitrateKbps / MBPS_THRESHOLD_KBPS).toFixed(1)} Mbps`
    : `${bitrateKbps} kbps`;
};

/** Format a frame rate as `29.97 fps` (≤2 decimals, no trailing zeros); null when unknown. */
export const formatFrameRate = (frameRate: number | null | undefined): string | null =>
  frameRate == null ? null : `${Number(frameRate.toFixed(2))} fps`;
