/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes or replaces a single metadata tag in an audio file using the
 * system ffmpeg binary. Streams are copied without re-encoding.
 *
 * Uses spawn (not exec) so tagValue is passed as a plain array element —
 * no shell-escaping or injection risk.
 *
 * Writes to a sibling temp file first, then atomically renames over the
 * original to avoid corruption if the process is interrupted mid-write.
 *
 * Metadata strategy: `-map_metadata -1` drops all inherited global/stream
 * metadata so the Ogg muxer cannot shadow the `-metadata` override with a
 * stale value. Existing tags (artist, title, etc.) are then re-read from
 * the input via `-i` and selectively forwarded by ffmpeg's codec-copy
 * path for containers that embed tags in stream headers (FLAC VorbisComment
 * blocks, Ogg Vorbis comment headers). For containers that store tags in a
 * separate global metadata block (MP4/M4A, AIFF ID3), the original tags
 * other than the target key are explicitly preserved via a two-pass
 * probe-then-write approach. In practice, `-map_metadata -1` combined with
 * `-codec copy` preserves stream-header tags for Ogg/FLAC while giving us
 * a clean slate for the explicit `-metadata` key.
 *
 * UPDATE: The above approach strips too many tags. The reliable cross-format
 * solution is to probe existing metadata, rebuild the full tag set with the
 * target key replaced, and pass all tags as `-metadata` arguments. This
 * guarantees the override wins regardless of muxer ordering.
 */
export async function writeTagViaFfmpeg(
  filePath: string,
  tagKey: string,
  tagValue: string
): Promise<void> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const tmpPath = path.join(dir, `.__tmp_${randomUUID()}${ext}`);

  try {
    // Step 1: Probe existing metadata so we can rebuild the full tag set.
    const existingTags = await probeMetadata(filePath);

    // Step 2: Merge — override the target key (case-insensitive match).
    const lowerKey = tagKey.toLowerCase();
    const mergedTags = new Map<string, string>();
    for (const [k, v] of Object.entries(existingTags)) {
      if (k.toLowerCase() !== lowerKey) {
        mergedTags.set(k, v);
      }
    }
    mergedTags.set(tagKey, tagValue);

    // Step 3: Build ffmpeg args with `-map_metadata -1` (clean slate)
    // then re-specify every tag explicitly.
    const metadataArgs: string[] = [];
    for (const [k, v] of mergedTags) {
      metadataArgs.push('-metadata', `${k}=${v}`);
    }

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-i',
        filePath,
        '-map',
        '0',
        '-map_metadata',
        '-1', // drop inherited metadata — we re-specify everything
        '-codec',
        'copy',
        ...metadataArgs,
        tmpPath,
      ];

      const stderrChunks: string[] = [];
      const maxStderrLength = 8_192;
      const proc = spawn('ffmpeg', args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        stderrChunks.push(text);

        const combined = stderrChunks.join('');
        if (combined.length > maxStderrLength) {
          stderrChunks.splice(0, stderrChunks.length, combined.slice(-maxStderrLength));
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const stderrOutput = stderrChunks.join('').trim();
        const stderrSuffix = stderrOutput ? `: ${stderrOutput}` : '';
        reject(
          new Error(`ffmpeg exited with code ${code} processing "${filePath}"${stderrSuffix}`)
        );
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}. Is ffmpeg installed?`));
      });
    });

    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * Probes an audio file with ffprobe and returns all metadata tags as a
 * plain key-value object. Reads both format-level and stream-level tags
 * because different containers store metadata at different levels — e.g.
 * Ogg Vorbis uses stream-level Vorbis Comment headers, while MP4/AIFF
 * use format-level tags. Stream tags take precedence when a key exists
 * at both levels.
 *
 * Returns an empty object if ffprobe fails or finds no tags.
 */
async function probeMetadata(filePath: string): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_entries',
      'format_tags:stream_tags',
      filePath,
    ];

    const stdoutChunks: string[] = [];
    const proc = spawn('ffprobe', args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    proc.stdout.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(stdoutChunks.join('')) as {
          format?: { tags?: Record<string, string> };
          streams?: Array<{ tags?: Record<string, string> }>;
        };

        // Merge format tags first, then stream tags on top (stream wins)
        const tags: Record<string, string> = {};
        const formatTags = parsed.format?.tags ?? {};
        for (const [k, v] of Object.entries(formatTags)) {
          tags[k] = v;
        }
        for (const stream of parsed.streams ?? []) {
          for (const [k, v] of Object.entries(stream.tags ?? {})) {
            tags[k] = v;
          }
        }

        resolve(tags);
      } catch {
        resolve({});
      }
    });

    proc.on('error', () => {
      resolve({});
    });
  });
}
