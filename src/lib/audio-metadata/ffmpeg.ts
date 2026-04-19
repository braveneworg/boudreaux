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
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y', // overwrite tmpPath if it somehow exists
        '-i',
        filePath,
        '-map',
        '0', // copy all streams
        '-map_metadata',
        '0', // preserve all existing metadata
        '-codec',
        'copy', // no re-encode
        '-metadata',
        `${tagKey}=${tagValue}`,
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
