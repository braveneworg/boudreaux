/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EventEmitter } from 'node:events';

import { PROBE_TIMEOUT_MS, probeUrl } from './ffprobe';

const mockSpawn = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const killMock = vi.fn();

/** Minimal spawn stand-in: EventEmitter core + stdout/stderr emitters + kill spy. */
class MockProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = (signal?: string): boolean => {
    killMock(signal);
    return true;
  };
}

const presignedUrl =
  'https://bucket.s3.amazonaws.com/media/videos/v1/clip.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef';

/** Queue a fresh mock process for the next spawn call and return it. */
const nextProc = (): MockProc => {
  const proc = new MockProc();
  mockSpawn.mockReturnValueOnce(proc);
  return proc;
};

describe('probeUrl', () => {
  it('spawns ffprobe with the exact arg vector and no shell', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stdout.emit('data', '{}');
    proc.emit('close', 0);
    await promise;

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', presignedUrl],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  });

  it('resolves ok with the parsed JSON on exit 0', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stdout.emit('data', '{"format":{"duration":');
    proc.stdout.emit('data', '"10.5"}}');
    proc.emit('close', 0);

    await expect(promise).resolves.toEqual({
      ok: true,
      raw: { format: { duration: '10.5' } },
    });
  });

  it('decodes a Buffer stdout chunk to parse the JSON', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stdout.emit('data', Buffer.from('{"format":{"duration":"7.0"}}', 'utf8'));
    proc.emit('close', 0);

    await expect(promise).resolves.toEqual({
      ok: true,
      raw: { format: { duration: '7.0' } },
    });
  });

  it('decodes a Buffer stderr chunk into the exit error', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stderr.emit('data', Buffer.from('boom', 'utf8'));
    proc.emit('close', 1);

    await expect(promise).resolves.toEqual({
      ok: false,
      error: 'ffprobe exited with code 1: boom',
    });
  });

  it('resolves an error on a non-zero exit with empty stderr', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.emit('close', 1);

    await expect(promise).resolves.toEqual({ ok: false, error: 'ffprobe exited with code 1' });
  });

  it('includes the stderr tail in the exit error', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stderr.emit('data', 'Server returned 403 Forbidden');
    proc.emit('close', 1);

    await expect(promise).resolves.toEqual({
      ok: false,
      error: 'ffprobe exited with code 1: Server returned 403 Forbidden',
    });
  });

  it('scrubs the presigned URL from stderr echoes', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stderr.emit('data', `${presignedUrl}: Input/output error`);
    proc.emit('close', 1);
    const result = await promise;

    expect(JSON.stringify(result)).not.toContain('X-Amz-');
  });

  it('keeps only the 8KB stderr tail', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stderr.emit('data', 'a'.repeat(16_384));
    proc.emit('close', 1);
    const result = await promise;

    expect(JSON.stringify(result).length).toBeLessThan(8_400);
  });

  it('resolves an error when stdout is not valid JSON', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stdout.emit('data', 'not-json');
    proc.emit('close', 0);

    await expect(promise).resolves.toEqual({
      ok: false,
      error: 'ffprobe produced unparseable JSON output',
    });
  });

  it('resolves an error when spawn itself fails', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.emit('error', new Error('spawn ffprobe ENOENT'));

    await expect(promise).resolves.toEqual({
      ok: false,
      error: 'Failed to spawn ffprobe: spawn ffprobe ENOENT',
    });
  });

  it('caps stdout at 2MB and resolves an error', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stdout.emit('data', 'x'.repeat(2 * 1024 * 1024 + 1));

    await expect(promise).resolves.toEqual({
      ok: false,
      error: 'ffprobe output exceeded the 2MB limit',
    });
  });

  it('SIGKILLs the process when stdout exceeds the cap', async () => {
    const proc = nextProc();

    const promise = probeUrl(presignedUrl);
    proc.stdout.emit('data', 'x'.repeat(2 * 1024 * 1024 + 1));
    await promise;

    expect(killMock).toHaveBeenCalledWith('SIGKILL');
  });

  it('resolves a timeout error after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      nextProc();
      const promise = probeUrl(presignedUrl);
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);

      await expect(promise).resolves.toEqual({
        ok: false,
        error: `ffprobe timed out after ${PROBE_TIMEOUT_MS}ms`,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('SIGKILLs the process on timeout', async () => {
    vi.useFakeTimers();
    try {
      nextProc();
      const promise = probeUrl(presignedUrl);
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      await promise;

      expect(killMock).toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a late close after the timeout already settled', async () => {
    vi.useFakeTimers();
    try {
      const proc = nextProc();
      const promise = probeUrl(presignedUrl);
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      proc.stdout.emit('data', '{}');
      proc.emit('close', 0);

      await expect(promise).resolves.toEqual({
        ok: false,
        error: `ffprobe timed out after ${PROBE_TIMEOUT_MS}ms`,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
