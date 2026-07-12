/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';

import type { VideoRow } from '@/lib/validation/video-schema';

import {
  buildTechnicalMetadataRows,
  VideoTechnicalMetadataCard,
} from './video-technical-metadata-card';

const baseVideo = {
  id: 'v1',
  title: 'Clip',
  artist: 'Band',
  category: 'MUSIC',
  description: null,
  releasedOn: new Date('2026-02-01T00:00:00.000Z'),
  durationSeconds: 200,
  s3Key: 'media/videos/v1/clip.mp4',
  fileName: 'clip.mp4',
  fileSize: 1048576n,
  mimeType: 'video/mp4',
  posterUrl: null,
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  width: null,
  height: null,
  videoCodec: null,
  audioCodec: null,
  bitrateKbps: null,
  frameRate: null,
  container: null,
  audioChannels: null,
  audioSampleRateHz: null,
  sourceCreatedAt: null,
  probedAt: null,
  probeError: null,
  enrichmentStatus: null,
} as VideoRow;

const probedVideo = {
  ...baseVideo,
  probedAt: new Date('2026-02-02T00:00:00.000Z'),
  width: 1920,
  height: 1080,
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrateKbps: 4200,
  frameRate: 29.97,
  container: 'mp4',
  audioChannels: 2,
  audioSampleRateHz: 44100,
} as VideoRow;

describe('buildTechnicalMetadataRows', () => {
  it('builds a row for every populated probe field', () => {
    expect(buildTechnicalMetadataRows(probedVideo)).toEqual([
      { label: 'Container', value: 'mp4' },
      { label: 'Resolution', value: '1920×1080' },
      { label: 'Video codec', value: 'h264' },
      { label: 'Audio codec', value: 'aac' },
      { label: 'Bitrate', value: '4.2 Mbps' },
      { label: 'Frame rate', value: '29.97 fps' },
      { label: 'Duration', value: '3:20' },
      { label: 'Audio channels', value: '2' },
      { label: 'Sample rate', value: '44100 Hz' },
    ]);
  });

  it('omits rows whose probe field is missing', () => {
    const rows = buildTechnicalMetadataRows({ ...probedVideo, videoCodec: null } as VideoRow);

    expect(rows.some((row) => row.label === 'Video codec')).toBe(false);
  });

  it('omits the Duration row when the duration is unknown', () => {
    const rows = buildTechnicalMetadataRows({ ...probedVideo, durationSeconds: null } as VideoRow);

    expect(rows.some((row) => row.label === 'Duration')).toBe(false);
  });
});

describe('VideoTechnicalMetadataCard', () => {
  it('renders nothing before the video has been probed', () => {
    render(<VideoTechnicalMetadataCard video={baseVideo} />);

    expect(screen.queryByTestId('video-technical-metadata-card')).not.toBeInTheDocument();
  });

  it('renders the section heading once probed', () => {
    render(<VideoTechnicalMetadataCard video={probedVideo} />);

    expect(screen.getByRole('heading', { name: 'Technical Metadata' })).toBeInTheDocument();
  });

  it('renders the formatted resolution', () => {
    render(<VideoTechnicalMetadataCard video={probedVideo} />);

    expect(screen.getByText('1920×1080')).toBeInTheDocument();
  });

  it('renders the Resolution term in the definition list', () => {
    render(<VideoTechnicalMetadataCard video={probedVideo} />);

    expect(screen.getByText('Resolution')).toBeInTheDocument();
  });

  it('renders the formatted bitrate', () => {
    render(<VideoTechnicalMetadataCard video={probedVideo} />);

    expect(screen.getByText('4.2 Mbps')).toBeInTheDocument();
  });

  it('shows the probe error state when probing failed', () => {
    render(
      <VideoTechnicalMetadataCard
        video={{ ...baseVideo, probeError: 'ffprobe exited 1' } as VideoRow}
      />
    );

    expect(screen.getByText(/ffprobe exited 1/)).toBeInTheDocument();
  });

  it('prefers the error state over the dl when both probedAt and probeError exist', () => {
    render(
      <VideoTechnicalMetadataCard
        video={{ ...probedVideo, probeError: 'ffprobe exited 1' } as VideoRow}
      />
    );

    expect(screen.queryByText('1920×1080')).not.toBeInTheDocument();
  });
});
