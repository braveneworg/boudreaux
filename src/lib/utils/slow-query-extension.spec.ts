// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSlowQueryExtension, resolveSlowQueryThresholdMs } from './slow-query-extension';

vi.mock('server-only', () => ({}));

const warnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { database: { warn: warnMock } },
}));

// Identity defineExtension so the spec can call query.$allOperations directly
vi.mock('@prisma/client', () => ({
  Prisma: { defineExtension: (extension: unknown) => extension },
}));

interface AllOperationsParams {
  model?: string;
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}

type ExtensionShape = {
  query: { $allOperations: (params: AllOperationsParams) => Promise<unknown> };
};

const runOperation = (
  thresholdMs: number,
  overrides: Partial<AllOperationsParams> = {}
): Promise<unknown> => {
  const extension = createSlowQueryExtension(thresholdMs) as unknown as ExtensionShape;
  return extension.query.$allOperations({
    model: 'Release',
    operation: 'findMany',
    args: { where: { secretField: 'never-logged' } },
    query: vi.fn().mockResolvedValue(['row']),
    ...overrides,
  });
};

describe('createSlowQueryExtension', () => {
  it('returns the query result and stays silent under the threshold', async () => {
    const result = await runOperation(Number.MAX_SAFE_INTEGER);

    expect(result).toEqual(['row']);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('warns with model, operation, and duration for slow queries', async () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(450);

    await runOperation(200);

    expect(warnMock).toHaveBeenCalledWith('Slow query', {
      model: 'Release',
      operation: 'findMany',
      durationMs: 450,
      thresholdMs: 200,
    });
    nowSpy.mockRestore();
  });

  it('never logs query arguments', async () => {
    await runOperation(0);

    const meta = warnMock.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.stringify(meta)).not.toContain('never-logged');
    expect(meta.args).toBeUndefined();
  });

  it('omits model for client-level operations', async () => {
    await runOperation(0, { model: undefined, operation: '$queryRaw' });

    expect(warnMock).toHaveBeenCalledWith(
      'Slow query',
      expect.not.objectContaining({ model: expect.anything() })
    );
  });

  it('rethrows query errors and still times them', async () => {
    const failure = new Error('db down');

    await expect(runOperation(0, { query: vi.fn().mockRejectedValue(failure) })).rejects.toThrow(
      'db down'
    );
    expect(warnMock).toHaveBeenCalledWith(
      'Slow query',
      expect.objectContaining({ model: 'Release' })
    );
  });
});

describe('resolveSlowQueryThresholdMs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.SLOW_QUERY_MS;
  });

  it('defaults to 200 when SLOW_QUERY_MS is unset', () => {
    delete process.env.SLOW_QUERY_MS;

    expect(resolveSlowQueryThresholdMs()).toBe(200);
  });

  it('parses a valid positive integer', () => {
    vi.stubEnv('SLOW_QUERY_MS', '500');

    expect(resolveSlowQueryThresholdMs()).toBe(500);
  });

  it('falls back to the default for invalid or non-positive values', () => {
    vi.stubEnv('SLOW_QUERY_MS', 'fast');
    expect(resolveSlowQueryThresholdMs()).toBe(200);

    vi.stubEnv('SLOW_QUERY_MS', '-50');
    expect(resolveSlowQueryThresholdMs()).toBe(200);

    vi.stubEnv('SLOW_QUERY_MS', '0');
    expect(resolveSlowQueryThresholdMs()).toBe(200);
  });
});
