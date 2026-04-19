/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

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
  proc.stderr = new Readable({
    read() {
      this.push(null);
    },
  });
  return proc;
}

/**
 * Creates a mock ffprobe process that returns the given tags as JSON.
 * Emits close(0) after stdout has been fully consumed.
 */
function createMockProbeProcess(tags: {
  formatTags?: Record<string, string>;
  streamTags?: Record<string, string>;
}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const output = {
    format: tags.formatTags ? { tags: tags.formatTags } : {},
    streams: tags.streamTags ? [{ tags: tags.streamTags }] : [],
  };
  proc.stdout = new Readable({
    read() {
      this.push(JSON.stringify(output));
      this.push(null);
    },
  });
  // ffprobe has no stderr piped
  proc.stderr = null as unknown as Readable;
  // Emit close after stdout ends so data events are delivered first
  proc.stdout.on('end', () => queueMicrotask(() => proc.emit('close', 0)));
  return proc;
}

/**
 * Creates a mock ffprobe process that fails (non-zero exit).
 */
function createFailingProbeProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new Readable({
    read() {
      this.push(null);
    },
  });
  proc.stderr = null as unknown as Readable;
  queueMicrotask(() => proc.emit('close', 1));
  return proc;
}

/**
 * Sets up mockSpawn so the first call (ffprobe) returns probeProc
 * and the second call (ffmpeg) returns ffmpegProc.
 */
function setupSpawnSequence(probeProc: ChildProcess, ffmpegProc: ChildProcess) {
  mockSpawn.mockReturnValueOnce(probeProc).mockReturnValueOnce(ffmpegProc);
}

describe('writeTagViaFfmpeg', () => {
  beforeEach(() => {
    mockRename.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it('should probe metadata then spawn ffmpeg with merged tags', async () => {
    const probeProc = createMockProbeProcess({
      formatTags: { artist: 'Test Artist', title: 'Test Title' },
    });
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    // Wait for probe to complete, then ffmpeg spawns
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    // First call is ffprobe
    expect(mockSpawn.mock.calls[0][0]).toBe('ffprobe');

    // Second call is ffmpeg with merged tags
    const ffmpegArgs = mockSpawn.mock.calls[1][1] as string[];
    expect(ffmpegArgs).toContain('-map_metadata');
    expect(ffmpegArgs[ffmpegArgs.indexOf('-map_metadata') + 1]).toBe('-1');
    expect(ffmpegArgs).toContain('-metadata');

    // Should contain all three tags
    const metadataEntries = ffmpegArgs.filter(
      (_arg: string, i: number) => i > 0 && ffmpegArgs[i - 1] === '-metadata'
    );
    expect(metadataEntries).toContain('artist=Test Artist');
    expect(metadataEntries).toContain('title=Test Title');
    expect(metadataEntries).toContain('COMMENT=Hello');
  });

  it('should override existing tag with case-insensitive match', async () => {
    const probeProc = createMockProbeProcess({
      streamTags: { comment: 'Old comment', ARTIST: 'Artist' },
    });
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.ogg', 'COMMENT', 'New comment');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    const ffmpegArgs = mockSpawn.mock.calls[1][1] as string[];
    const metadataEntries = ffmpegArgs.filter(
      (_arg: string, i: number) => i > 0 && ffmpegArgs[i - 1] === '-metadata'
    );

    // Should NOT contain old 'comment' key, only the new 'COMMENT'
    expect(metadataEntries).toContain('COMMENT=New comment');
    expect(metadataEntries).not.toContain('comment=Old comment');
    // Should preserve other tags
    expect(metadataEntries).toContain('ARTIST=Artist');
  });

  it('should merge format and stream tags (stream wins on conflict)', async () => {
    const probeProc = createMockProbeProcess({
      formatTags: { artist: 'Format Artist' },
      streamTags: { artist: 'Stream Artist', title: 'Stream Title' },
    });
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.ogg', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    const ffmpegArgs = mockSpawn.mock.calls[1][1] as string[];
    const metadataEntries = ffmpegArgs.filter(
      (_arg: string, i: number) => i > 0 && ffmpegArgs[i - 1] === '-metadata'
    );

    // Stream artist should override format artist
    expect(metadataEntries).toContain('artist=Stream Artist');
    expect(metadataEntries).not.toContain('artist=Format Artist');
    expect(metadataEntries).toContain('title=Stream Title');
  });

  it('should handle ffprobe failure gracefully and still write the tag', async () => {
    const probeProc = createFailingProbeProcess();
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    const ffmpegArgs = mockSpawn.mock.calls[1][1] as string[];
    const metadataEntries = ffmpegArgs.filter(
      (_arg: string, i: number) => i > 0 && ffmpegArgs[i - 1] === '-metadata'
    );

    // Only the new tag since probe returned empty
    expect(metadataEntries).toEqual(['COMMENT=Hello']);
  });

  it('should handle ffprobe returning invalid JSON', async () => {
    const probeProc = new EventEmitter() as ChildProcess;
    probeProc.stdout = new Readable({
      read() {
        this.push('not valid json');
        this.push(null);
      },
    });
    probeProc.stderr = null as unknown as Readable;
    queueMicrotask(() => probeProc.emit('close', 0));

    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    // Should still succeed with just the new tag
    const ffmpegArgs = mockSpawn.mock.calls[1][1] as string[];
    const metadataEntries = ffmpegArgs.filter(
      (_arg: string, i: number) => i > 0 && ffmpegArgs[i - 1] === '-metadata'
    );
    expect(metadataEntries).toEqual(['COMMENT=Hello']);
  });

  it('should handle ffprobe spawn error gracefully', async () => {
    const probeProc = new EventEmitter() as ChildProcess;
    probeProc.stdout = new Readable({
      read() {
        this.push(null);
      },
    });
    probeProc.stderr = null as unknown as Readable;
    queueMicrotask(() => probeProc.emit('error', new Error('ENOENT')));

    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    // Should still succeed — ffprobe failure is non-fatal
    expect(mockRename).toHaveBeenCalled();
  });

  it('should rename temp file over original on success', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    expect(mockRename).toHaveBeenCalledWith(expect.stringContaining('.__tmp_'), '/tmp/track.flac');
  });

  it('should reject when ffmpeg exits with non-zero code', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 1);

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('should include ffmpeg stderr output on non-zero exit code', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.stderr?.emit('data', Buffer.from('invalid metadata key'));
    ffmpegProc.emit('close', 1);

    await expect(promise).rejects.toThrow('invalid metadata key');
  });

  it('should clean up temp file on ffmpeg failure', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 1);

    await expect(promise).rejects.toThrow();

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.__tmp_'));
  });

  it('should reject when ffmpeg fails to spawn', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('Failed to spawn ffmpeg: ENOENT');
  });

  it('should clean up temp file on spawn error', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow();

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.__tmp_'));
  });

  it('should not throw if temp file cleanup fails', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);
    mockUnlink.mockRejectedValue(new Error('ENOENT'));

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 1);

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('should use correct temp file extension matching source', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.ogg', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    const spawnArgs = mockSpawn.mock.calls[1][1] as string[];
    const tmpPath = spawnArgs[spawnArgs.length - 1];
    expect(tmpPath).toMatch(/\.ogg$/);
  });

  it('should truncate excessively long stderr output', async () => {
    const probeProc = createMockProbeProcess({});
    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    // Emit large stderr data exceeding maxStderrLength (8192)
    const largeChunk = 'x'.repeat(10_000);
    ffmpegProc.stderr?.emit('data', Buffer.from(largeChunk));
    ffmpegProc.emit('close', 1);

    await expect(promise).rejects.toThrow();
  });

  it('should handle probed tags with no format or streams', async () => {
    // Empty JSON object from ffprobe
    const probeProc = new EventEmitter() as ChildProcess;
    probeProc.stdout = new Readable({
      read() {
        this.push(JSON.stringify({}));
        this.push(null);
      },
    });
    probeProc.stderr = null as unknown as Readable;
    queueMicrotask(() => probeProc.emit('close', 0));

    const ffmpegProc = createMockProcess();
    setupSpawnSequence(probeProc, ffmpegProc);

    const promise = writeTagViaFfmpeg('/tmp/track.flac', 'COMMENT', 'Hello');
    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
    ffmpegProc.emit('close', 0);

    await promise;

    const ffmpegArgs = mockSpawn.mock.calls[1][1] as string[];
    const metadataEntries = ffmpegArgs.filter(
      (_arg: string, i: number) => i > 0 && ffmpegArgs[i - 1] === '-metadata'
    );
    expect(metadataEntries).toEqual(['COMMENT=Hello']);
  });
});
