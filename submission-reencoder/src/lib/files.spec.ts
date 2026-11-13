/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';

import { createWorkspace, fileBytes, fileSink, fileSource, removeWorkspace } from './files.js';

describe('workspace', () => {
  it('makes a fresh directory under the temp root', async () => {
    const dir = await createWorkspace();

    expect(dirname(dir)).toBe(tmpdir());
    expect(basename(dir)).toMatch(/^reencode-.+/);
    await removeWorkspace(dir);
  });

  it('makes a different directory every time', async () => {
    const first = await createWorkspace();
    const second = await createWorkspace();

    expect(second).not.toBe(first);
    await removeWorkspace(first);
    await removeWorkspace(second);
  });

  it('removes the directory and everything in it', async () => {
    const dir = await createWorkspace();
    await pipeline(Readable.from([Buffer.from('abc')]), fileSink(join(dir, 'upload')));

    await removeWorkspace(dir);

    await expect(fileBytes(dir)).rejects.toThrow(/ENOENT/);
  });

  it('does not fail when the directory is already gone', async () => {
    const dir = await createWorkspace();
    await removeWorkspace(dir);

    await expect(removeWorkspace(dir)).resolves.toBeUndefined();
  });
});

describe('files', () => {
  it('writes a stream to a file and reads it back', async () => {
    const dir = await createWorkspace();
    const path = join(dir, 'upload');

    await pipeline(Readable.from([Buffer.from('hello '), Buffer.from('world')]), fileSink(path));

    expect((await buffer(fileSource(path))).toString()).toBe('hello world');
    expect(await fileBytes(path)).toBe(11);
    await removeWorkspace(dir);
  });

  it('refuses to write over a file that is already there', async () => {
    const dir = await createWorkspace();
    const path = join(dir, 'upload');
    await pipeline(Readable.from([Buffer.from('first')]), fileSink(path));

    await expect(pipeline(Readable.from([Buffer.from('second')]), fileSink(path))).rejects.toThrow(
      /EEXIST/
    );
    await removeWorkspace(dir);
  });
});
