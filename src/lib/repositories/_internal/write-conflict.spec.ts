/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DataError } from '@/lib/types/domain/errors';

import { isWriteConflict, retryOnWriteConflict } from './write-conflict';

const conflict = (): Error =>
  Object.assign(new Error('Transaction failed due to a write conflict'), { code: 'P2034' });

describe('isWriteConflict', () => {
  it.each([
    ['a bare Prisma conflict', conflict(), true],
    ['a conflict the data-error layer wrapped', new DataError('UNKNOWN', 'x', conflict()), true],
    [
      'a conflict wrapped twice',
      new DataError('UNKNOWN', 'x', new DataError('UNKNOWN', 'y', conflict())),
      true,
    ],
    ['another Prisma error', Object.assign(new Error('not found'), { code: 'P2025' }), false],
    ['an error with no code', new Error('boom'), false],
    ['a thrown string', 'P2034', false],
    ['nothing', undefined, false],
  ])('answers %s with %s', (_case, error, expected) => {
    expect(isWriteConflict(error)).toBe(expected);
  });
});

describe('retryOnWriteConflict', () => {
  it('answers what the transaction resolved, running it once', async () => {
    const transaction = vi.fn(async () => 'stored');

    await expect(retryOnWriteConflict(transaction, 3)).resolves.toBe('stored');
    expect(transaction.mock.calls).toHaveLength(1);
  });

  it('runs a transaction that lost a write conflict again', async () => {
    const transaction = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce('stored');

    await expect(retryOnWriteConflict(transaction, 3)).resolves.toBe('stored');
    expect(transaction.mock.calls).toHaveLength(2);
  });

  it('gives up with the conflict after the last attempt', async () => {
    const transaction = vi.fn(async () => {
      throw conflict();
    });

    await expect(retryOnWriteConflict(transaction, 2)).rejects.toMatchObject({ code: 'P2034' });
    expect(transaction.mock.calls).toHaveLength(2);
  });

  it('never runs again on any other error', async () => {
    const transaction = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(retryOnWriteConflict(transaction, 3)).rejects.toThrow('boom');
    expect(transaction.mock.calls).toHaveLength(1);
  });
});
