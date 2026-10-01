// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { DataError } from '@/lib/types/domain/errors';

import { createDataErrorExtension } from './data-error-extension';

import type * as PrismaClientModule from '@prisma/client';

// The real `defineExtension` returns a `(client) => client.$extends(ext)`
// function; an identity version lets the spec call `query.$allOperations`
// directly while the error classes `toDataError` checks stay the real ones.
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof PrismaClientModule>();
  return {
    ...actual,
    Prisma: { ...actual.Prisma, defineExtension: (extension: unknown) => extension },
  };
});

interface AllOperationsParams {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}

type ExtensionShape = {
  name: string;
  query: { $allOperations: (params: AllOperationsParams) => Promise<unknown> };
};

const runOperation = (query: AllOperationsParams['query']): Promise<unknown> => {
  const extension = createDataErrorExtension() as unknown as ExtensionShape;
  return extension.query.$allOperations({
    model: 'Release',
    operation: 'findMany',
    args: { where: { id: 'abc' } },
    query,
  });
};

describe('createDataErrorExtension', () => {
  it('is named so the extension shows up in Prisma diagnostics', () => {
    const extension = createDataErrorExtension() as unknown as ExtensionShape;

    expect(extension.name).toBe('data-error-translation');
  });

  it('passes the args through and returns the query result unchanged', async () => {
    const query = vi.fn().mockResolvedValue(['row']);

    const result = await runOperation(query);

    expect(result).toEqual(['row']);
    expect(query).toHaveBeenCalledWith({ where: { id: 'abc' } });
  });

  it('rethrows a known-request error as a DataError with the mapped code', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });

    const rejection = runOperation(() => Promise.reject(prismaError));

    await expect(rejection).rejects.toBeInstanceOf(DataError);
    await expect(rejection).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  it('rethrows an initialization error as UNAVAILABLE', async () => {
    const prismaError = new Prisma.PrismaClientInitializationError('down', '6.0.0');

    await expect(runOperation(() => Promise.reject(prismaError))).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('rethrows a duck-typed P2025 (no Prisma instance) as NOT_FOUND', async () => {
    const duck = Object.assign(new Error('missing'), { code: 'P2025' });

    await expect(runOperation(() => Promise.reject(duck))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rethrows a timeout as TIMEOUT', async () => {
    const timeout = Object.assign(new Error('socket ETIMEOUT'), { code: 'ETIMEOUT' });

    await expect(runOperation(() => Promise.reject(timeout))).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('rethrows anything else as UNKNOWN and keeps the cause', async () => {
    const cause = new Error('boom');

    const rejection = runOperation(() => Promise.reject(cause));

    await expect(rejection).rejects.toMatchObject({ code: 'UNKNOWN', cause });
  });

  it('leaves a DataError thrown inside the query untouched', async () => {
    const already = new DataError('NOT_FOUND', 'Playlist not found');

    await expect(runOperation(() => Promise.reject(already))).rejects.toBe(already);
  });
});
