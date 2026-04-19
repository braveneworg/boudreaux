/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EventEmitter } from 'node:events';

import { writeTagViaFfmpeg } from './ffmpeg';

import type { ChildProcess } from 'node:child_process';

const mockRename = vi.fn();
const mockUnlink = vi.fn();

vi.mock('node:fs/promises', () => ({
  default: {
    rename: (...args: unknown[]) => mockRename(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  rename: (...args: unknown[]) => mockRename(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

const mockSpawn = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stderr = new EventEmitter();
  return proc;
}

describe('writeTagViaFfmpeg', () => {
  beforeEach(() => {
    mockRename.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it('should spawn ffmpeg with correct arguments', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('close', 0);

    await promise;

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffmpeg',
      [
        '-y',
        '-i',
        '/tmp/track.flac',
        '-map',
        '0',
        '-map_metadata',
        '0',
        '-codec',
        'copy',
        '-metadata',
        'COMMENT=Hello',
        expect.stringContaining('.__tmp_'),
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
  });

  it('should rename temp file over original on success', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('close', 0);

    await promise;

    expect(mockRename).toHaveBeenCalledWith(expect.stringContaining('.__tmp_'), '/tmp/track.flac');
  });

  it('should reject when ffmpeg exits with non-zero code', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('should include ffmpeg stderr output on non-zero exit code', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.stderr?.emit('data', Buffer.from('invalid metadata key'));
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('invalid metadata key');
  });

  it('should clean up temp file on ffmpeg failure', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow();

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.__tmp_'));
  });

  it('should reject when ffmpeg fails to spawn', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('Failed to spawn ffmpeg: ENOENT');
  });

  it('should clean up temp file on spawn error', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow();

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.__tmp_'));
  });

  it('should not throw if temp file cleanup fails', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    mockUnlink.mockRejectedValue(new Error('ENOENT'));

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('should use correct temp file extension matching source', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = writeTagViaFfmpeg('/tmp/track.ogg', 'COMMENT', 'Hello');
    proc.emit('close', 0);

    await promise;

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    const tmpPath = spawnArgs[spawnArgs.length - 1];
    expect(tmpPath).toMatch(/\.ogg$/);
  });
});
