/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mp3BitrateKbps, planMedia, readProbe } from './probe.js';

import type { ProbeReport, ProbeStream } from './probe.js';
import type { ProcessResult } from './types.js';

const exited = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
  code: 0,
  stdout: '',
  stderrTail: '',
  timedOut: false,
  overflowed: false,
  ...overrides,
});

const probeJson = JSON.stringify({
  programs: [],
  streams: [
    {
      index: 0,
      codec_name: 'h264',
      codec_type: 'video',
      width: 1920,
      height: 1080,
      bit_rate: '4000000',
      disposition: { attached_pic: 0 },
    },
    { index: 1, codec_name: 'aac', codec_type: 'audio', bit_rate: '128000' },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.500000', bit_rate: '4200000' },
});

/** The failure code a call refuses with, or `null` when it does not throw. */
const failureOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (err) {
    return (err as { failure?: string }).failure ?? 'not-a-reencode-error';
  }
};

const video = (overrides: Partial<ProbeStream> = {}): ProbeStream => ({
  index: 0,
  codecType: 'video',
  attachedPicture: false,
  width: 1280,
  height: 720,
  bitRate: null,
  ...overrides,
});

const audio = (overrides: Partial<ProbeStream> = {}): ProbeStream => ({
  index: 1,
  codecType: 'audio',
  attachedPicture: false,
  width: null,
  height: null,
  bitRate: 128_000,
  ...overrides,
});

const report = (overrides: Partial<ProbeReport> = {}): ProbeReport => ({
  formatNames: ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'],
  durationSeconds: 30,
  bitRate: 1_000_000,
  streams: [video(), audio()],
  ...overrides,
});

describe('readProbe', () => {
  it('reads the format names, the duration and the streams', () => {
    expect(readProbe(exited({ stdout: probeJson }))).toEqual({
      formatNames: ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'],
      durationSeconds: 12.5,
      bitRate: 4_200_000,
      streams: [
        {
          index: 0,
          codecType: 'video',
          attachedPicture: false,
          width: 1920,
          height: 1080,
          bitRate: 4_000_000,
        },
        {
          index: 1,
          codecType: 'audio',
          attachedPicture: false,
          width: null,
          height: null,
          bitRate: 128_000,
        },
      ],
    });
  });

  it('reads a length ffprobe could not tell as unknown', () => {
    const noLength = JSON.stringify({ streams: [], format: { format_name: 'matroska,webm' } });

    expect(readProbe(exited({ stdout: noLength })).durationSeconds).toBeNull();
  });

  it('marks cover art as an attached picture', () => {
    const coverArt = JSON.stringify({
      streams: [{ index: 0, codec_type: 'video', disposition: { attached_pic: 1 } }],
      format: { format_name: 'mp3' },
    });

    expect(readProbe(exited({ stdout: coverArt })).streams.at(0)?.attachedPicture).toBe(true);
  });

  it('refuses a demuxer off the whitelist as unsupported', () => {
    const stderrTail = "[concat @ 0x1] Format not on whitelist 'mov,mp4'\n/tmp/x/upload: Invalid";

    expect(failureOf(() => readProbe(exited({ code: 1, stderrTail })))).toBe('unsupported');
  });

  it('refuses a protocol off the whitelist as unsupported', () => {
    const stderrTail = "[http @ 0x1] Protocol 'http' not on whitelist 'file'!";

    expect(failureOf(() => readProbe(exited({ code: 1, stderrTail })))).toBe('unsupported');
  });

  it('refuses an HLS playlist ffprobe would not detect by content as unsupported', () => {
    const stderrTail =
      'Not detecting m3u8/hls with non standard extension and non standard mime type';

    expect(failureOf(() => readProbe(exited({ code: 1, stderrTail })))).toBe('unsupported');
  });

  it('refuses a file ffprobe cannot parse as unreadable', () => {
    const stderrTail = '/tmp/x/upload: Invalid data found when processing input';

    expect(failureOf(() => readProbe(exited({ code: 1, stderrTail })))).toBe('unreadable');
  });

  it('refuses output that is not JSON as unreadable', () => {
    expect(failureOf(() => readProbe(exited({ stdout: '{' })))).toBe('unreadable');
  });

  it('refuses output with no format as unreadable', () => {
    expect(failureOf(() => readProbe(exited({ stdout: '{}' })))).toBe('unreadable');
  });

  it('refuses runaway output as unreadable', () => {
    expect(failureOf(() => readProbe(exited({ code: null, overflowed: true })))).toBe('unreadable');
  });

  it('reports a probe that ran out of time as failed', () => {
    expect(failureOf(() => readProbe(exited({ code: null, timedOut: true })))).toBe('failed');
  });

  it('reports a probe that never started as failed', () => {
    expect(failureOf(() => readProbe(exited({ code: null })))).toBe('failed');
  });
});

describe('planMedia', () => {
  it('refuses a playlist by its format name', () => {
    expect(failureOf(() => planMedia(report({ formatNames: ['hls'] }), 'VIDEO'))).toBe(
      'unsupported'
    );
  });

  it('refuses a concat script by its format name', () => {
    expect(failureOf(() => planMedia(report({ formatNames: ['concat'] }), 'VIDEO'))).toBe(
      'unsupported'
    );
  });

  it('refuses an image sequence by its format name', () => {
    expect(failureOf(() => planMedia(report({ formatNames: ['image2'] }), 'VIDEO'))).toBe(
      'unsupported'
    );
  });

  it('refuses a format with any name off the list', () => {
    expect(failureOf(() => planMedia(report({ formatNames: ['mov', 'hls'] }), 'VIDEO'))).toBe(
      'unsupported'
    );
  });

  it('refuses a format with no name', () => {
    expect(failureOf(() => planMedia(report({ formatNames: [] }), 'VIDEO'))).toBe('unsupported');
  });

  it('keeps a video with sound as video, on its first picture and first sound', () => {
    const streams = [audio({ index: 0 }), video({ index: 1 }), video({ index: 2 })];

    expect(planMedia(report({ streams }), 'VIDEO')).toEqual({
      kind: 'VIDEO',
      videoIndex: 1,
      audioIndex: 0,
      durationSeconds: 30,
    });
  });

  it('keeps a silent video as video with no sound', () => {
    expect(planMedia(report({ streams: [video()] }), 'VIDEO')).toMatchObject({
      kind: 'VIDEO',
      audioIndex: null,
    });
  });

  it('keeps a video upload with no picture as audio', () => {
    expect(planMedia(report({ streams: [audio({ index: 0 })] }), 'VIDEO')).toEqual({
      kind: 'AUDIO',
      audioIndex: 0,
      bitrateKbps: 128,
      durationSeconds: 30,
    });
  });

  it('does not count cover art as a picture', () => {
    const streams = [video({ attachedPicture: true }), audio()];

    expect(planMedia(report({ streams }), 'VIDEO').kind).toBe('AUDIO');
  });

  it('keeps an audio upload as audio even when it carries a picture', () => {
    expect(planMedia(report(), 'AUDIO')).toMatchObject({ kind: 'AUDIO', audioIndex: 1 });
  });

  it('refuses a file with no picture and no sound', () => {
    expect(failureOf(() => planMedia(report({ streams: [] }), 'VIDEO'))).toBe('unsupported');
  });

  it('refuses a file with only subtitle and data streams', () => {
    const streams = [video({ codecType: 'subtitle' }), audio({ codecType: 'data' })];

    expect(failureOf(() => planMedia(report({ streams }), 'VIDEO'))).toBe('unsupported');
  });

  it('refuses an audio upload with a picture and no sound', () => {
    expect(failureOf(() => planMedia(report({ streams: [video()] }), 'AUDIO'))).toBe('unsupported');
  });

  it('refuses a video over ten minutes', () => {
    expect(failureOf(() => planMedia(report({ durationSeconds: 601.5 }), 'VIDEO'))).toBe(
      'too-long'
    );
  });

  it('allows a video a fraction over ten minutes', () => {
    expect(failureOf(() => planMedia(report({ durationSeconds: 600.9 }), 'VIDEO'))).toBeNull();
  });

  it('holds a video upload with no picture to the audio limit', () => {
    const streams = [audio()];

    expect(planMedia(report({ streams, durationSeconds: 3600 }), 'VIDEO').kind).toBe('AUDIO');
  });

  it('refuses audio over three hours', () => {
    expect(failureOf(() => planMedia(report({ durationSeconds: 10_802 }), 'AUDIO'))).toBe(
      'too-long'
    );
  });

  it('plans a file whose length is unknown, leaving the limit to the encode', () => {
    expect(planMedia(report({ durationSeconds: null }), 'VIDEO').durationSeconds).toBeNull();
  });

  it('falls back to the container bitrate when the sound stream has none', () => {
    const streams = [audio({ bitRate: null })];

    expect(planMedia(report({ streams, bitRate: 100_000 }), 'AUDIO')).toMatchObject({
      bitrateKbps: 96,
    });
  });
});

describe('mp3BitrateKbps', () => {
  it.each([
    { source: null, expected: 192 },
    { source: 1_411_200, expected: 192 },
    { source: 320_000, expected: 192 },
    { source: 192_000, expected: 192 },
    { source: 128_000, expected: 128 },
    { source: 127_999, expected: 112 },
    { source: 100_000, expected: 96 },
    { source: 64_000, expected: 64 },
    { source: 40_000, expected: 64 },
    { source: 0, expected: 192 },
  ])('keeps a $source bit/s source at $expected kbps', ({ source, expected }) => {
    expect(mp3BitrateKbps(source)).toBe(expected);
  });
});
