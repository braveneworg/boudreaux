/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { normalizeProbe, redactProbeJson, type NormalizedProbe } from './normalize';

const s3Key = 'media/videos/507f1f77bcf86cd799439011/clip.mp4';

const presignedUrl = `https://bucket.s3.amazonaws.com/${s3Key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef`;

/** Representative ffprobe -show_format -show_streams output. */
const rawProbe = {
  format: {
    filename: presignedUrl,
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    bit_rate: '5000000',
    tags: {
      creation_time: '2024-01-15T10:30:00.000000Z',
      encoder: 'Lavf60.3.100',
    },
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      avg_frame_rate: '30000/1001',
      color_space: 'bt709',
      color_primaries: 'bt709',
      color_transfer: 'bt709',
      side_data_list: [{ side_data_type: 'Display Matrix' }],
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      channels: 2,
      sample_rate: '48000',
    },
  ],
};

const NULL_PROBE: NormalizedProbe = {
  container: null,
  width: null,
  height: null,
  videoCodec: null,
  audioCodec: null,
  bitrateKbps: null,
  frameRate: null,
  audioChannels: null,
  audioSampleRateHz: null,
  colorSpace: null,
  colorPrimaries: null,
  colorTransfer: null,
  sourceCreatedAt: null,
  encoder: null,
};

describe('normalizeProbe', () => {
  it('extracts the container from format_name', () => {
    expect(normalizeProbe(rawProbe).container).toBe('mov,mp4,m4a,3gp,3g2,mj2');
  });

  it('extracts width from the first video stream', () => {
    expect(normalizeProbe(rawProbe).width).toBe(1920);
  });

  it('extracts height from the first video stream', () => {
    expect(normalizeProbe(rawProbe).height).toBe(1080);
  });

  it('extracts the video codec', () => {
    expect(normalizeProbe(rawProbe).videoCodec).toBe('h264');
  });

  it('extracts the audio codec from the first audio stream', () => {
    expect(normalizeProbe(rawProbe).audioCodec).toBe('aac');
  });

  it('rounds bit_rate (bits/s string) to whole kbps', () => {
    expect(normalizeProbe(rawProbe).bitrateKbps).toBe(5000);
  });

  it('evaluates the avg_frame_rate fraction to 2dp', () => {
    expect(normalizeProbe(rawProbe).frameRate).toBe(29.97);
  });

  it('extracts the audio channel count', () => {
    expect(normalizeProbe(rawProbe).audioChannels).toBe(2);
  });

  it('parses the sample_rate string to Hz', () => {
    expect(normalizeProbe(rawProbe).audioSampleRateHz).toBe(48000);
  });

  it('extracts colorSpace', () => {
    expect(normalizeProbe(rawProbe).colorSpace).toBe('bt709');
  });

  it('extracts colorPrimaries', () => {
    expect(normalizeProbe(rawProbe).colorPrimaries).toBe('bt709');
  });

  it('extracts colorTransfer', () => {
    expect(normalizeProbe(rawProbe).colorTransfer).toBe('bt709');
  });

  it('parses the creation_time tag to a Date', () => {
    expect(normalizeProbe(rawProbe).sourceCreatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });

  it('extracts the encoder tag', () => {
    expect(normalizeProbe(rawProbe).encoder).toBe('Lavf60.3.100');
  });

  it('falls back to the quicktime creationdate tag', () => {
    const raw = {
      format: { tags: { 'com.apple.quicktime.creationdate': '2023-06-01T00:00:00Z' } },
    };

    expect(normalizeProbe(raw).sourceCreatedAt).toEqual(new Date('2023-06-01T00:00:00Z'));
  });

  it('falls back to the video-stream encoder tag', () => {
    const raw = {
      streams: [{ codec_type: 'video', tags: { encoder: 'x264 core 164' } }],
    };

    expect(normalizeProbe(raw).encoder).toBe('x264 core 164');
  });

  it('uses the FIRST video stream when several exist', () => {
    const raw = {
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920 },
        { codec_type: 'video', codec_name: 'mjpeg', width: 320 },
      ],
    };

    expect(normalizeProbe(raw).videoCodec).toBe('h264');
  });

  it('returns all nulls for a null payload', () => {
    expect(normalizeProbe(null)).toEqual(NULL_PROBE);
  });

  it('returns all nulls for a non-object payload', () => {
    expect(normalizeProbe('junk')).toEqual(NULL_PROBE);
  });

  it('returns all nulls for an empty object', () => {
    expect(normalizeProbe({})).toEqual(NULL_PROBE);
  });

  it('returns a null frameRate for a 0/0 fraction', () => {
    const raw = { streams: [{ codec_type: 'video', avg_frame_rate: '0/0' }] };

    expect(normalizeProbe(raw).frameRate).toBeNull();
  });

  it('returns a null bitrate for a non-numeric bit_rate', () => {
    const raw = { format: { bit_rate: 'N/A' } };

    expect(normalizeProbe(raw).bitrateKbps).toBeNull();
  });

  it('returns a null sourceCreatedAt for an unparseable creation_time', () => {
    const raw = { format: { tags: { creation_time: 'not-a-date' } } };

    expect(normalizeProbe(raw).sourceCreatedAt).toBeNull();
  });
});

describe('redactProbeJson', () => {
  it('replaces format.filename with the bare s3Key', () => {
    const redacted = redactProbeJson(rawProbe, s3Key) as { format: { filename: string } };

    expect(redacted.format.filename).toBe(s3Key);
  });

  it('leaves no X-Amz- substring anywhere in the redacted payload', () => {
    expect(JSON.stringify(redactProbeJson(rawProbe, s3Key))).not.toContain('X-Amz-');
  });

  it('scrubs X-Amz- material echoed outside format.filename', () => {
    const raw = {
      format: { filename: presignedUrl },
      streams: [{ codec_type: 'video', tags: { comment: presignedUrl } }],
    };

    expect(JSON.stringify(redactProbeJson(raw, s3Key))).not.toContain('X-Amz-');
  });

  it('does not mutate the input', () => {
    redactProbeJson(rawProbe, s3Key);

    expect(rawProbe.format.filename).toBe(presignedUrl);
  });

  it('keeps a small payload (with side_data_list) intact below the cap', () => {
    const redacted = redactProbeJson(rawProbe, s3Key) as {
      streams: Array<Record<string, unknown>>;
    };

    expect(redacted.streams[0]).toHaveProperty('side_data_list');
  });

  it('passes through a non-object payload unchanged', () => {
    expect(redactProbeJson('scalar', s3Key)).toBe('scalar');
  });

  it('drops side_data_list when the payload exceeds 256KB', () => {
    const raw = {
      format: { filename: presignedUrl },
      streams: [{ codec_type: 'video', side_data_list: [{ data: 'x'.repeat(300 * 1024) }] }],
    };

    const redacted = redactProbeJson(raw, s3Key) as {
      streams: Array<Record<string, unknown>>;
    };

    expect(redacted.streams[0]).not.toHaveProperty('side_data_list');
  });

  it('keeps the stream itself after dropping its side_data_list', () => {
    const raw = {
      format: { filename: presignedUrl },
      streams: [{ codec_type: 'video', side_data_list: [{ data: 'x'.repeat(300 * 1024) }] }],
    };

    const redacted = redactProbeJson(raw, s3Key) as {
      streams: Array<Record<string, unknown>>;
    };

    expect(redacted.streams[0]?.codec_type).toBe('video');
  });

  it('falls back to a truncation marker when still over the cap', () => {
    const raw = { format: { filename: presignedUrl, tags: { comment: 'x'.repeat(300 * 1024) } } };

    expect(redactProbeJson(raw, s3Key)).toEqual({ __truncated: true });
  });

  it('degrades to a truncation marker when the payload cannot be serialized', () => {
    const circular: Record<string, unknown> = { format: {} };
    circular.self = circular;

    expect(redactProbeJson(circular, s3Key)).toEqual({ __truncated: true });
  });
});
