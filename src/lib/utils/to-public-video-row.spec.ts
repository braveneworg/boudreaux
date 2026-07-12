/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Video } from '@/lib/types/domain/video';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

import { toPublicVideoRow } from './to-public-video-row';

vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: vi.fn().mockReturnValue(null),
}));

const fullVideo: Video = {
  id: '507f1f77bcf86cd799439011',
  title: 'Test Video',
  artist: 'Test Artist',
  category: 'MUSIC',
  description: 'A description',
  releasedOn: new Date('2024-01-01'),
  durationSeconds: 120,
  s3Key: 'videos/test/video.mp4',
  fileName: 'video.mp4',
  fileSize: BigInt(123456),
  mimeType: 'video/mp4',
  posterUrl: 'poster.webp',
  publishedAt: new Date('2024-02-01'),
  archivedAt: null,
  createdBy: 'admin-1',
  updatedBy: 'admin-2',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  probedAt: new Date('2024-01-03'),
  probeError: 'some probe error',
  container: 'mov',
  width: 1920,
  height: 1080,
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrateKbps: 4500,
  frameRate: 30,
  audioChannels: 2,
  audioSampleRateHz: 48000,
  colorSpace: 'bt709',
  colorPrimaries: 'bt709',
  colorTransfer: 'bt709',
  sourceCreatedAt: new Date('2024-01-01'),
  encoder: 'Lavf',
  probeData: { format: { filename: 'media/videos/test/video.mp4' } },
  enrichmentStatus: 'pending',
  enrichmentError: 'enrichment failed',
  enrichmentStartedAt: new Date('2024-01-04'),
  enrichmentJobToken: 'secret-job-token',
  enrichmentProgress: { step: 'scraping' },
  enrichedAt: new Date('2024-01-05'),
};

describe('toPublicVideoRow', () => {
  it('drops the enrichmentJobToken callback secret', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('enrichmentJobToken');
  });

  it('drops the raw probeData JSON', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('probeData');
  });

  it('drops the enrichmentStatus job state', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('enrichmentStatus');
  });

  it('drops the probedAt audit timestamp', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('probedAt');
  });

  it('drops the createdBy audit ObjectId', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('createdBy');
  });

  it('drops the updatedBy audit ObjectId', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('updatedBy');
  });

  it('drops a probe display field (width)', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('width');
  });

  it('drops the enrichedAt timestamp', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row).not.toHaveProperty('enrichedAt');
  });

  it('retains the public id field', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row.id).toBe('507f1f77bcf86cd799439011');
  });

  it('retains the public title field', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row.title).toBe('Test Video');
  });

  it('retains the public artist field', () => {
    const row = toPublicVideoRow(fullVideo);

    expect(row.artist).toBe('Test Artist');
  });

  it('attaches the signed stream URL from the s3Key', () => {
    vi.mocked(signStreamUrl).mockReturnValueOnce('https://cdn.example.com/video.mp4');

    const row = toPublicVideoRow(fullVideo);

    expect(row.streamUrl).toBe('https://cdn.example.com/video.mp4');
  });

  it('attaches a null stream URL when signing is unconfigured', () => {
    vi.mocked(signStreamUrl).mockReturnValueOnce(null);

    const row = toPublicVideoRow(fullVideo);

    expect(row.streamUrl).toBeNull();
  });
});
