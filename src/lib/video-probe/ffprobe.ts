/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { spawn } from 'node:child_process';

/** Outcome of probing a media URL: parsed raw ffprobe JSON, or a safe error. */
export type ProbeUrlResult = { ok: true; raw: unknown } | { ok: false; error: string };

/** Hard kill for a hung probe — header reads finish in seconds even on 5 GB files. */
export const PROBE_TIMEOUT_MS = 30_000;

/** ffprobe -show_format/-show_streams JSON is ~100 KB at worst; 2 MB is runaway output. */
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;

/** Keep only the stderr tail so error messages stay bounded. */
const MAX_STDERR_BYTES = 8_192;

/**
 * Remove credential material from text that may echo the probed URL: drop
 * exact occurrences of the URL, then any residual X-Amz-* query fragments.
 */
const scrubUrl = (text: string, url: string): string =>
  text
    .split(url)
    .join('[media-url]')
    .replace(/X-Amz-[^\s"'&]*/g, '[redacted]');

/**
 * Probe a presigned media URL with the system ffprobe binary and return the
 * parsed `-show_format -show_streams` JSON.
 *
 * Spawn discipline mirrors `src/lib/audio-metadata/ffmpeg.ts`: arg-vector
 * spawn (no shell, no injection surface), bounded stderr tail, resolve-only
 * promise. On top of that: a 30 s SIGKILL timeout, a 2 MB stdout cap, and —
 * because the URL is a credentialed presigned S3 GET — the URL is never
 * logged and is scrubbed from every error message.
 *
 * Never throws and never rejects; every failure resolves `{ ok: false, error }`.
 */
export const probeUrl = (url: string): Promise<ProbeUrlResult> =>
  new Promise((resolve) => {
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', url];
    const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let settled = false;
    let stdout = '';
    let stderrTail = '';

    // `timer` is initialized synchronously below, before any handler can fire.
    const settle = (result: ProbeUrlResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      settle({ ok: false, error: `ffprobe timed out after ${PROBE_TIMEOUT_MS}ms` });
    }, PROBE_TIMEOUT_MS);

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (stdout.length > MAX_STDOUT_BYTES) {
        proc.kill('SIGKILL');
        settle({ ok: false, error: 'ffprobe output exceeded the 2MB limit' });
      }
    });

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stderrTail = (stderrTail + text).slice(-MAX_STDERR_BYTES);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const tail = scrubUrl(stderrTail, url).trim();
        settle({
          ok: false,
          error: `ffprobe exited with code ${code}${tail ? `: ${tail}` : ''}`,
        });
        return;
      }
      try {
        settle({ ok: true, raw: JSON.parse(stdout) as unknown });
      } catch {
        settle({ ok: false, error: 'ffprobe produced unparseable JSON output' });
      }
    });

    proc.on('error', (err) => {
      settle({ ok: false, error: `Failed to spawn ffprobe: ${scrubUrl(err.message, url)}` });
    });
  });
