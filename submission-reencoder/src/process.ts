/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { spawn } from 'node:child_process';

import { toErrorMessage } from './lib/log.js';

import type { ProcessRequest, ProcessResult, RunProcess } from './types.js';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

/** An ffprobe report is a few kilobytes; a megabyte of it is runaway output. */
const MAX_STDOUT_BYTES = 1024 * 1024;

/** Keep only the end of stderr, where the reason a run failed is. */
const MAX_STDERR_BYTES = 8_192;

/** What a run has gathered so far. */
interface RunState {
  stdout: string;
  stderrTail: string;
  timedOut: boolean;
  overflowed: boolean;
  settled: boolean;
}

const textOf = (chunk: Buffer | string): string =>
  typeof chunk === 'string' ? chunk : chunk.toString('utf8');

/**
 * How ffmpeg and ffprobe are started: an argument vector and no shell, so
 * nothing in an argument is interpreted; no stdin; the run's temp dir as the
 * working directory; and none of the Lambda's environment but `PATH` — the
 * role's credentials live in the environment, and a decoder parsing a
 * stranger's file has no use for them.
 */
const spawnOptions = (cwd: string): SpawnOptions => ({
  cwd,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { PATH: process.env.PATH ?? '' },
  windowsHide: true,
});

const resultOf = (state: RunState, code: number | null): ProcessResult => ({
  code,
  stdout: state.stdout,
  stderrTail: state.stderrTail,
  timedOut: state.timedOut,
  overflowed: state.overflowed,
});

const notStarted = (err: unknown): ProcessResult => ({
  code: null,
  stdout: '',
  stderrTail: toErrorMessage(err),
  timedOut: false,
  overflowed: false,
});

/** Take a chunk of stdout: hand it on, or hold it up to the bound. `false` means over. */
const takeStdout = (
  state: RunState,
  text: string,
  onStdout: ProcessRequest['onStdout']
): boolean => {
  if (onStdout) {
    onStdout(text);
    return true;
  }
  if (state.stdout.length + text.length > MAX_STDOUT_BYTES) {
    state.stdout = '';
    state.overflowed = true;
    return false;
  }
  state.stdout += text;
  return true;
};

/** Wire a started child to the promise that reports how it ended. */
const watch = (
  child: ChildProcess,
  { timeoutMs, onStdout }: ProcessRequest,
  resolve: (result: ProcessResult) => void
): void => {
  const state: RunState = {
    stdout: '',
    stderrTail: '',
    timedOut: false,
    overflowed: false,
    settled: false,
  };
  const finish = (code: number | null): void => {
    if (state.settled) {
      return;
    }
    state.settled = true;
    clearTimeout(timer);
    resolve(resultOf(state, code));
  };
  const stop = (): void => {
    child.kill('SIGKILL');
    finish(null);
  };
  const timer = setTimeout(() => {
    state.timedOut = true;
    stop();
  }, timeoutMs);

  child.stdout?.on('data', (chunk: Buffer | string) => {
    if (!state.settled && !takeStdout(state, textOf(chunk), onStdout)) {
      stop();
    }
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    state.stderrTail = (state.stderrTail + textOf(chunk)).slice(-MAX_STDERR_BYTES);
  });
  child.on('error', (err) => {
    state.stderrTail = toErrorMessage(err);
    finish(null);
  });
  child.on('close', (code) => {
    finish(code);
  });
};

/**
 * Build the runner for ffmpeg and ffprobe. A run never rejects: a process that
 * cannot start, runs past its timeout or writes past the stdout bound is
 * reported in the result, and a run that overstays is killed.
 *
 * @param spawnFn - Injectable `spawn`, so the runner is testable without the binaries.
 */
export const createProcessRunner =
  (spawnFn: typeof spawn = spawn): RunProcess =>
  (request) =>
    new Promise((resolve) => {
      try {
        const child = spawnFn(request.binary, [...request.args], spawnOptions(request.cwd));
        watch(child, request, resolve);
      } catch (err) {
        resolve(notStarted(err));
      }
    });
