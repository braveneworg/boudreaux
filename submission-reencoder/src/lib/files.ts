/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Readable, Writable } from 'node:stream';

/**
 * Every file-system call the Lambda makes. The paths are all the run's own:
 * a directory this module names, and fixed file names inside it. Nothing a
 * user typed is ever part of a path.
 */

/** The prefix of a run's temp dir; the rest is random. */
const WORKSPACE_PREFIX = 'reencode-';

/** Make a fresh, private directory for one run under the temp root (`/tmp` on Lambda). */
export const createWorkspace = (): Promise<string> => mkdtemp(join(tmpdir(), WORKSPACE_PREFIX));

/**
 * Remove a run's directory and everything in it. Lambda reuses its sandbox, so
 * a directory left behind eats the next run's disk.
 */
export const removeWorkspace = async (dir: string): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
};

/** A file's size in bytes. */
export const fileBytes = async (path: string): Promise<number> => (await stat(path)).size;

/** A stream that writes a new file; it fails if the file is already there. */
export const fileSink = (path: string): Writable => createWriteStream(path, { flags: 'wx' });

/** A stream that reads a file. */
export const fileSource = (path: string): Readable => createReadStream(path);
