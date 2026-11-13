/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EventEmitter } from 'node:events';

import { createProcessRunner } from './process.js';

import type { ProcessRequest } from './types.js';
import type { SpawnOptions } from 'node:child_process';

/** A child process the test drives by hand. */
class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn();
}

const harness = () => {
  const child = new FakeChild();
  const spawnFn = vi.fn(
    (_binary: string, _args: readonly string[], _options: SpawnOptions) => child
  );
  const run = createProcessRunner(spawnFn as unknown as Parameters<typeof createProcessRunner>[0]);
  return { child, spawnFn, run };
};

const request = (overrides: Partial<ProcessRequest> = {}): ProcessRequest => ({
  binary: 'ffprobe',
  args: ['-v', 'error', '-i', '/tmp/reencode-x/upload'],
  timeoutMs: 60_000,
  cwd: '/tmp/reencode-x',
  ...overrides,
});

const spawnOptions = (spawnFn: ReturnType<typeof harness>['spawnFn']): SpawnOptions =>
  spawnFn.mock.calls[0][2];

describe('createProcessRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the named binary with the argument vector it was given', async () => {
    const { child, spawnFn, run } = harness();

    const done = run(request());
    child.emit('close', 0);
    await done;

    expect(spawnFn).toHaveBeenCalledWith(
      'ffprobe',
      ['-v', 'error', '-i', '/tmp/reencode-x/upload'],
      expect.anything()
    );
  });

  it('never goes through a shell', async () => {
    const { child, spawnFn, run } = harness();

    const done = run(request());
    child.emit('close', 0);
    await done;

    expect(spawnOptions(spawnFn).shell).toBe(false);
  });

  it('gives the process no stdin', async () => {
    const { child, spawnFn, run } = harness();

    const done = run(request());
    child.emit('close', 0);
    await done;

    expect(spawnOptions(spawnFn).stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('runs in the temp dir it was given', async () => {
    const { child, spawnFn, run } = harness();

    const done = run(request());
    child.emit('close', 0);
    await done;

    expect(spawnOptions(spawnFn).cwd).toBe('/tmp/reencode-x');
  });

  it('hands the process PATH and nothing else of its own environment', async () => {
    const { child, spawnFn, run } = harness();

    const done = run(request());
    child.emit('close', 0);
    await done;

    expect(Object.keys(spawnOptions(spawnFn).env ?? {})).toEqual(['PATH']);
  });

  it('answers the exit code and what the process wrote', async () => {
    const { child, run } = harness();

    const done = run(request());
    child.stdout.emit('data', Buffer.from('{"format":'));
    child.stdout.emit('data', '{}}');
    child.stderr.emit('data', Buffer.from('a warning'));
    child.emit('close', 0);

    expect(await done).toEqual({
      code: 0,
      stdout: '{"format":{}}',
      stderrTail: 'a warning',
      timedOut: false,
      overflowed: false,
    });
  });

  it('answers a non-zero exit code', async () => {
    const { child, run } = harness();

    const done = run(request());
    child.emit('close', 1);

    expect((await done).code).toBe(1);
  });

  it('keeps only the end of stderr', async () => {
    const { child, run } = harness();

    const done = run(request());
    child.stderr.emit('data', Buffer.from('a'.repeat(20_000)));
    child.stderr.emit('data', Buffer.from('the last line'));
    child.emit('close', 1);

    const { stderrTail } = await done;
    expect(stderrTail).toHaveLength(8_192);
    expect(stderrTail.endsWith('the last line')).toBe(true);
  });

  it('kills a process whose output runs past the bound', async () => {
    const { child, run } = harness();

    const done = run(request());
    child.stdout.emit('data', Buffer.alloc(1024 * 1024 + 1, 0x61));

    expect(await done).toMatchObject({ code: null, overflowed: true, stdout: '' });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('kills a process that runs past its timeout', async () => {
    const { child, run } = harness();

    const done = run(request({ timeoutMs: 5_000 }));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await done).toMatchObject({ code: null, timedOut: true });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('does not kill a process that finished in time', async () => {
    const { child, run } = harness();

    const done = run(request({ timeoutMs: 5_000 }));
    child.emit('close', 0);
    await done;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(child.kill).not.toHaveBeenCalled();
  });

  it('streams stdout to the listener instead of holding it', async () => {
    const { child, run } = harness();
    const onStdout = vi.fn();

    const done = run(request({ binary: 'ffmpeg', onStdout }));
    child.stdout.emit('data', Buffer.from('out_time_us=1000000\n'));
    child.stdout.emit('data', Buffer.alloc(2 * 1024 * 1024, 0x61));
    child.emit('close', 0);

    expect(await done).toMatchObject({ code: 0, stdout: '', overflowed: false });
    expect(onStdout).toHaveBeenNthCalledWith(1, 'out_time_us=1000000\n');
  });

  it('answers a process that could not start, without rejecting', async () => {
    const { child, run } = harness();

    const done = run(request());
    child.emit('error', new Error('spawn ffprobe ENOENT'));

    expect(await done).toMatchObject({ code: null, stderrTail: 'spawn ffprobe ENOENT' });
  });

  it('answers a spawn that throws, without rejecting', async () => {
    const spawnFn = vi.fn(() => {
      throw new Error('bad argument');
    });
    const run = createProcessRunner(
      spawnFn as unknown as Parameters<typeof createProcessRunner>[0]
    );

    expect(await run(request())).toMatchObject({ code: null, stderrTail: 'bad argument' });
  });
});
