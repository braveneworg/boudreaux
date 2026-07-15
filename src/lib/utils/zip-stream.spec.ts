/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Readable } from 'node:stream';

import type { getS3Client } from '@/lib/utils/s3-client';

import {
  createStoreArchive,
  fetchObjectBuffer,
  issuePrefetch,
  safeArchiveEntryName,
  startBufferPrefetch,
} from './zip-stream';

vi.mock('server-only', () => ({}));

type S3ClientLike = ReturnType<typeof getS3Client>;

const makeClient = (send: ReturnType<typeof vi.fn>): S3ClientLike =>
  ({ send }) as unknown as S3ClientLike;

describe('safeArchiveEntryName', () => {
  it('flattens traversal paths to the basename', () => {
    expect(safeArchiveEntryName('../../etc/passwd')).toBe('passwd');
  });

  it('replaces backslashes and disallowed characters with underscores', () => {
    // POSIX path.basename does not split on `\`, so the backslash survives
    // into the replace step and becomes an underscore like `:` and `?`.
    expect(safeArchiveEntryName('a\\b:c?.mp3')).toBe('a_b_c_.mp3');
  });

  it('collapses runs of dots', () => {
    expect(safeArchiveEntryName('evil....mp3')).toBe('evil_mp3');
  });

  it('keeps the playlist entry-name shape intact', () => {
    expect(safeArchiveEntryName('01 - Ceschi - Cold Wind.mp3')).toBe('01 - Ceschi - Cold Wind.mp3');
  });

  it('falls back to "file" for an empty result', () => {
    expect(safeArchiveEntryName('')).toBe('file');
  });
});

describe('fetchObjectBuffer', () => {
  it('uses the smithy transformToByteArray helper when present', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([97, 98])) },
    });
    const buffer = await fetchObjectBuffer(makeClient(send), 'bucket', 'key');
    expect(buffer?.toString()).toBe('ab');
  });

  it('drains a plain Readable body into one buffer', async () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('abc')]) });
    const buffer = await fetchObjectBuffer(makeClient(send), 'bucket', 'key');
    expect(buffer?.toString()).toBe('abc');
  });

  it('returns null when the response has no body', async () => {
    const send = vi.fn().mockResolvedValue({ Body: undefined });
    expect(await fetchObjectBuffer(makeClient(send), 'bucket', 'key')).toBeNull();
  });

  it('returns null for an unrecognized body shape', async () => {
    const send = vi.fn().mockResolvedValue({ Body: { not: 'a stream' } });
    expect(await fetchObjectBuffer(makeClient(send), 'bucket', 'key')).toBeNull();
  });
});

describe('issuePrefetch', () => {
  it('still rejects on await after attaching the passive handler', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(issuePrefetch(makeClient(send), 'bucket', 'key')).rejects.toThrow('boom');
  });
});

describe('startBufferPrefetch', () => {
  it('issues at most `depth` initial fetches', () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('x')]) });
    const inFlight = startBufferPrefetch(makeClient(send), 'bucket', ['k1', 'k2', 'k3'], 2);
    expect(inFlight).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps at the key count when depth exceeds it', () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('x')]) });
    const inFlight = startBufferPrefetch(makeClient(send), 'bucket', ['k1'], 8);
    expect(inFlight).toHaveLength(1);
  });
});

describe('createStoreArchive', () => {
  it('emits a zip (PK) containing the appended entry', async () => {
    const archive = createStoreArchive();
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => archive.on('end', resolve));
    archive.append(Buffer.from('hello'), { name: 'test.mp3' });
    archive.finalize();
    await done;
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes('test.mp3')).toBe(true);
  });
});
