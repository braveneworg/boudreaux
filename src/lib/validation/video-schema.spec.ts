/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { videoRowSchema } from './video-schema';

/** Minimal valid serialized row, as `/api/videos` emits it (listing shape). */
const baseWireRow = {
  id: '507f1f77bcf86cd799439011',
  title: 'Test Video',
  artist: 'Test Artist',
  category: 'MUSIC',
  description: null,
  releasedOn: '2026-01-01T00:00:00.000Z',
  durationSeconds: 120,
  s3Key: 'media/videos/507f1f77bcf86cd799439011/clip.mp4',
  fileName: 'clip.mp4',
  fileSize: 123456,
  mimeType: 'video/mp4',
  posterUrl: null,
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('videoRowSchema — probe/enrichment wire fields', () => {
  it('parses a listing row with every probe field absent', () => {
    const parsed = videoRowSchema.parse(baseWireRow);

    expect(parsed.width).toBeUndefined();
  });

  it('keeps width on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, width: 1920 });

    expect(parsed.width).toBe(1920);
  });

  it('coerces a numeric-string width', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, width: '1920' });

    expect(parsed.width).toBe(1920);
  });

  it('accepts a null width', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, width: null });

    expect(parsed.width).toBeNull();
  });

  it('keeps height on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, height: 1080 });

    expect(parsed.height).toBe(1080);
  });

  it('keeps videoCodec on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, videoCodec: 'h264' });

    expect(parsed.videoCodec).toBe('h264');
  });

  it('keeps audioCodec on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, audioCodec: 'aac' });

    expect(parsed.audioCodec).toBe('aac');
  });

  it('keeps bitrateKbps on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, bitrateKbps: 5000 });

    expect(parsed.bitrateKbps).toBe(5000);
  });

  it('keeps a fractional frameRate on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, frameRate: 29.97 });

    expect(parsed.frameRate).toBe(29.97);
  });

  it('keeps container on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, container: 'mov,mp4' });

    expect(parsed.container).toBe('mov,mp4');
  });

  it('keeps audioChannels on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, audioChannels: 2 });

    expect(parsed.audioChannels).toBe(2);
  });

  it('keeps audioSampleRateHz on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, audioSampleRateHz: 48000 });

    expect(parsed.audioSampleRateHz).toBe(48000);
  });

  it('coerces sourceCreatedAt to a Date', () => {
    const parsed = videoRowSchema.parse({
      ...baseWireRow,
      sourceCreatedAt: '2024-01-15T10:30:00.000Z',
    });

    expect(parsed.sourceCreatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });

  it('coerces probedAt to a Date', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, probedAt: '2026-07-11T00:00:00.000Z' });

    expect(parsed.probedAt).toEqual(new Date('2026-07-11T00:00:00.000Z'));
  });

  it('accepts a null probedAt', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, probedAt: null });

    expect(parsed.probedAt).toBeNull();
  });

  it('keeps probeError on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, probeError: 'ffprobe exited 1' });

    expect(parsed.probeError).toBe('ffprobe exited 1');
  });

  it('keeps enrichmentStatus on the wire', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentStatus: 'pending' });

    expect(parsed.enrichmentStatus).toBe('pending');
  });

  it('strips probeData (never on the wire)', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, probeData: { format: {} } });

    expect(parsed).not.toHaveProperty('probeData');
  });

  it('strips enrichmentJobToken (never on the wire)', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentJobToken: 'tok' });

    expect(parsed).not.toHaveProperty('enrichmentJobToken');
  });

  it('strips enrichmentProgress (never on the wire)', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentProgress: { stage: 'x' } });

    expect(parsed).not.toHaveProperty('enrichmentProgress');
  });

  it('strips enrichmentError (never on the wire)', () => {
    const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentError: 'boom' });

    expect(parsed).not.toHaveProperty('enrichmentError');
  });
});
