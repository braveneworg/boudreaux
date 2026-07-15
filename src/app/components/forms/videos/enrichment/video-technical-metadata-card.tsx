/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatVideoDuration } from '@/lib/utils/format-duration';
import type { VideoRow } from '@/lib/validation/video-schema';

import { formatBitrate, formatFrameRate, formatResolution } from './video-enrichment-format';

interface VideoTechnicalMetadataCardProps {
  /** The loaded video row (edit mode); probe fields may all be null pre-probe. */
  video: VideoRow;
}

interface TechnicalMetadataRow {
  label: string;
  value: string;
}

/** Project the probe scalars into ordered label/value rows, dropping unknowns. */
export const buildTechnicalMetadataRows = (video: VideoRow): TechnicalMetadataRow[] => {
  const candidates: Array<[string, string | null]> = [
    ['Container', video.container ?? null],
    ['Resolution', formatResolution(video.width, video.height)],
    ['Video codec', video.videoCodec ?? null],
    ['Audio codec', video.audioCodec ?? null],
    ['Bitrate', formatBitrate(video.bitrateKbps)],
    ['Frame rate', formatFrameRate(video.frameRate)],
    ['Duration', video.durationSeconds == null ? null : formatVideoDuration(video.durationSeconds)],
    ['Audio channels', video.audioChannels == null ? null : String(video.audioChannels)],
    ['Sample rate', video.audioSampleRateHz == null ? null : `${video.audioSampleRateHz} Hz`],
  ];
  return candidates
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, value]) => ({ label, value }));
};

/**
 * Read-only `<dl>` of everything ffprobe reported for the uploaded file.
 * Hidden entirely until the server has probed (or failed to probe) the file;
 * a probe failure renders the stored error instead of the grid. Rendered for
 * ALL video categories — probe data is category-independent.
 *
 * @param video - The loaded video row from the admin detail query.
 */
export const VideoTechnicalMetadataCard = ({
  video,
}: VideoTechnicalMetadataCardProps): React.ReactElement | null => {
  if (!video.probedAt && !video.probeError) return null;

  return (
    <section
      data-testid="video-technical-metadata-card"
      className="space-y-3 border border-zinc-300 p-4"
    >
      <h2 className="font-semibold">Technical Metadata</h2>
      {video.probeError ? (
        <p role="status" className="text-destructive text-sm">
          Probe failed: {video.probeError}
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          {buildTechnicalMetadataRows(video).map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-zinc-700">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
