/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { DataError } from '@/lib/types/domain/errors';

import { runQuery, toDataError } from './map-prisma-error';

describe('toDataError', () => {
  it('maps P2002 (unique constraint) to DUPLICATE', () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });

    expect(toDataError(error).code).toBe('DUPLICATE');
  });

  it('maps P2025 (record not found) to NOT_FOUND', () => {
    const error = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });

    expect(toDataError(error).code).toBe('NOT_FOUND');
  });

  it('maps P2023 (malformed id) to VALIDATION', () => {
    const error = new Prisma.PrismaClientKnownRequestError('bad id', {
      code: 'P2023',
      clientVersion: '6.0.0',
    });

    expect(toDataError(error).code).toBe('VALIDATION');
  });

  it('maps an unrecognized known-request code to UNKNOWN', () => {
    const error = new Prisma.PrismaClientKnownRequestError('weird', {
      code: 'P2999',
      clientVersion: '6.0.0',
    });

    expect(toDataError(error).code).toBe('UNKNOWN');
  });

  // Turbopack bundles Prisma into separate module contexts, so `instanceof
  // Prisma.PrismaClientKnownRequestError` can be false for a real Prisma error.
  // The duck-typed fallback keeps known-request codes mapped regardless.
  it('maps a duck-typed P2002 error (not a Prisma instance) to DUPLICATE', () => {
    const error = Object.assign(new Error('dup'), { code: 'P2002' });

    expect(toDataError(error).code).toBe('DUPLICATE');
  });

  it('maps a duck-typed P2025 error (not a Prisma instance) to NOT_FOUND', () => {
    const error = Object.assign(new Error('missing'), { code: 'P2025' });

    expect(toDataError(error).code).toBe('NOT_FOUND');
  });

  it('does not treat a non-Prisma string code as a known-request error', () => {
    const error = Object.assign(new Error('nope'), { code: 'SOME_OTHER' });

    expect(toDataError(error).code).toBe('UNKNOWN');
  });

  it('maps PrismaClientInitializationError to UNAVAILABLE', () => {
    const error = new Prisma.PrismaClientInitializationError('no db', '6.0.0');

    expect(toDataError(error).code).toBe('UNAVAILABLE');
  });

  it('maps an ETIMEOUT-coded error to TIMEOUT', () => {
    const error = Object.assign(new Error('timed out'), { code: 'ETIMEOUT' });

    expect(toDataError(error).code).toBe('TIMEOUT');
  });

  it('maps an unknown error to UNKNOWN', () => {
    expect(toDataError(new Error('boom')).code).toBe('UNKNOWN');
  });

  it('maps a non-Error throw to UNKNOWN', () => {
    expect(toDataError('boom').code).toBe('UNKNOWN');
  });

  it('returns a DataError instance', () => {
    expect(toDataError(new Error('boom'))).toBeInstanceOf(DataError);
  });

  it('preserves the original error as the cause', () => {
    const original = new Error('boom');

    expect(toDataError(original).cause).toBe(original);
  });
});

describe('runQuery', () => {
  it('returns the resolved value when the query succeeds', async () => {
    await expect(runQuery(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('rethrows a Prisma error as a DataError', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });

    await expect(runQuery(() => Promise.reject(prismaError))).rejects.toBeInstanceOf(DataError);
  });

  it('rethrows with the mapped code', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });

    await expect(runQuery(() => Promise.reject(prismaError))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
