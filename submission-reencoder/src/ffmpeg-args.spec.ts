/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ALLOWED_FORMATS, audioArgs, posterArgs, probeArgs, videoArgs } from './ffmpeg-args.js';

const INPUT = '/tmp/reencode-abc/upload';

const builders: ReadonlyArray<{ name: string; args: string[]; input: string }> = [
  { name: 'probeArgs', args: probeArgs(INPUT), input: INPUT },
  {
    name: 'videoArgs',
    args: videoArgs({
      inputPath: INPUT,
      outputPath: '/tmp/reencode-abc/copy.mp4',
      videoIndex: 0,
      audioIndex: 1,
    }),
    input: INPUT,
  },
  {
    name: 'audioArgs',
    args: audioArgs({
      inputPath: INPUT,
      outputPath: '/tmp/reencode-abc/copy.mp3',
      audioIndex: 0,
      bitrateKbps: 128,
    }),
    input: INPUT,
  },
  {
    name: 'posterArgs',
    args: posterArgs({
      inputPath: '/tmp/reencode-abc/copy.mp4',
      outputPath: '/tmp/reencode-abc/poster.jpg',
      atSeconds: 1.5,
    }),
    input: '/tmp/reencode-abc/copy.mp4',
  },
];

/** The value that follows a flag, or `undefined` when the flag is absent. */
const valueOf = (args: readonly string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args.at(at + 1);
};

describe('ALLOWED_FORMATS', () => {
  it('lists only container demuxers, never a text-driven one', () => {
    const textDriven = ['hls', 'applehttp', 'concat', 'sdp', 'rtsp', 'image2', 'lavfi', 'dash'];

    expect(ALLOWED_FORMATS.filter((format) => textDriven.includes(format))).toEqual([]);
  });

  it('covers the containers the upload types arrive in', () => {
    expect(ALLOWED_FORMATS).toEqual(
      expect.arrayContaining([
        'mov',
        'mp4',
        'm4a',
        '3gp',
        'matroska',
        'webm',
        'avi',
        'mp3',
        'wav',
        'flac',
        'ogg',
        'aiff',
        'aac',
      ])
    );
  });
});

describe.each(builders)('$name input guards', ({ args, input }) => {
  it('allows the file protocol and no other', () => {
    expect(valueOf(args, '-protocol_whitelist')).toBe('file');
  });

  it('allows only the listed container demuxers', () => {
    expect(valueOf(args, '-format_whitelist')).toBe(ALLOWED_FORMATS.join(','));
  });

  it('sets both whitelists before the input, where they apply to it', () => {
    const inputAt = args.indexOf('-i');

    expect(args.indexOf('-protocol_whitelist')).toBeLessThan(inputAt);
    expect(args.indexOf('-format_whitelist')).toBeLessThan(inputAt);
  });

  it('reads exactly one input, the local path it was given', () => {
    expect(args.filter((arg) => arg === '-i')).toHaveLength(1);
    expect(valueOf(args, '-i')).toBe(input);
  });

  it('passes no URL anywhere', () => {
    expect(args.filter((arg) => arg.includes('://'))).toEqual([]);
  });
});

describe.each(builders.filter(({ name }) => name !== 'probeArgs'))(
  '$name process flags',
  ({ args }) => {
    it('never reads stdin', () => {
      expect(args).toContain('-nostdin');
    });

    it('drops the source metadata', () => {
      expect(valueOf(args, '-map_metadata')).toBe('-1');
    });
  }
);

describe('probeArgs', () => {
  it('asks for JSON', () => {
    expect(valueOf(probeArgs(INPUT), '-print_format')).toBe('json');
  });

  it('asks for the format name, so a playlist cannot pass as media', () => {
    expect(valueOf(probeArgs(INPUT), '-show_entries')).toContain('format_name');
  });

  it('does not ask for tags, which are text a stranger wrote', () => {
    expect(valueOf(probeArgs(INPUT), '-show_entries')).not.toContain('tags');
  });
});

describe('videoArgs', () => {
  const args = videoArgs({
    inputPath: INPUT,
    outputPath: '/tmp/reencode-abc/copy.mp4',
    videoIndex: 2,
    audioIndex: 5,
  });

  it('encodes H.264', () => {
    expect(valueOf(args, '-c:v')).toBe('libx264');
  });

  it('writes 8-bit 4:2:0, which every browser plays', () => {
    expect(valueOf(args, '-pix_fmt')).toBe('yuv420p');
  });

  it('encodes AAC audio', () => {
    expect(valueOf(args, '-c:a')).toBe('aac');
  });

  it('maps the chosen video and audio streams and nothing else', () => {
    const maps = args.flatMap((arg, at) => (arg === '-map' ? [args.at(at + 1)] : []));

    expect(maps).toEqual(['0:2', '0:5']);
  });

  it('puts the index first so playback can start before the download ends', () => {
    expect(valueOf(args, '-movflags')).toBe('+faststart');
  });

  it('drops chapters, subtitles and data streams', () => {
    expect(valueOf(args, '-map_chapters')).toBe('-1');
    expect(args).toEqual(expect.arrayContaining(['-sn', '-dn']));
  });

  it('holds the short side to 720 without enlarging, on even dimensions', () => {
    expect(valueOf(args, '-vf')).toBe(
      "scale=w='if(gt(iw,ih),-2,max(2,2*trunc(min(720,iw)/2)))':h='if(gt(iw,ih),max(2,2*trunc(min(720,ih)/2)),-2)'"
    );
  });

  it('stops writing just past the longest video accepted', () => {
    expect(valueOf(args, '-t')).toBe('602');
  });

  it('reports progress on stdout', () => {
    expect(valueOf(args, '-progress')).toBe('pipe:1');
  });

  it('writes an MP4 to the output path, last', () => {
    expect(valueOf(args, '-f')).toBe('mp4');
    expect(args.at(-1)).toBe('/tmp/reencode-abc/copy.mp4');
  });

  it('writes no audio when the source has none', () => {
    const silent = videoArgs({
      inputPath: INPUT,
      outputPath: '/tmp/reencode-abc/copy.mp4',
      videoIndex: 0,
      audioIndex: null,
    });

    expect(silent).toContain('-an');
    expect(silent).not.toContain('-c:a');
  });
});

describe('audioArgs', () => {
  const args = audioArgs({
    inputPath: INPUT,
    outputPath: '/tmp/reencode-abc/copy.mp3',
    audioIndex: 3,
    bitrateKbps: 96,
  });

  it('encodes MP3', () => {
    expect(valueOf(args, '-c:a')).toBe('libmp3lame');
  });

  it('encodes at the bitrate it was given', () => {
    expect(valueOf(args, '-b:a')).toBe('96k');
  });

  it('maps the chosen audio stream and nothing else', () => {
    const maps = args.flatMap((arg, at) => (arg === '-map' ? [args.at(at + 1)] : []));

    expect(maps).toEqual(['0:3']);
  });

  it('drops any picture, chapters, subtitles and data streams', () => {
    expect(valueOf(args, '-map_chapters')).toBe('-1');
    expect(args).toEqual(expect.arrayContaining(['-vn', '-sn', '-dn']));
  });

  it('stops writing just past the longest audio accepted', () => {
    expect(valueOf(args, '-t')).toBe('10802');
  });

  it('writes an MP3 to the output path, last', () => {
    expect(valueOf(args, '-f')).toBe('mp3');
    expect(args.at(-1)).toBe('/tmp/reencode-abc/copy.mp3');
  });
});

describe('posterArgs', () => {
  const args = posterArgs({
    inputPath: '/tmp/reencode-abc/copy.mp4',
    outputPath: '/tmp/reencode-abc/poster.jpg',
    atSeconds: 1.5,
  });

  it('seeks to the frame it was asked for', () => {
    expect(valueOf(args, '-ss')).toBe('1.5');
  });

  it('writes exactly one frame', () => {
    expect(valueOf(args, '-frames:v')).toBe('1');
  });

  it('writes the poster to the output path, last', () => {
    expect(args.at(-1)).toBe('/tmp/reencode-abc/poster.jpg');
  });
});
