// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { getRequestId } from '@/lib/utils/request-context';

import { logAction, withLogging } from './with-logging';

const { infoMock, warnMock, errorMock, shouldSampleMock } = vi.hoisted(() => ({
  infoMock: vi.fn(),
  warnMock: vi.fn(),
  errorMock: vi.fn(),
  shouldSampleMock: vi.fn(() => true),
}));

vi.mock('@/lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: infoMock, warn: warnMock, error: errorMock })),
  shouldSample: shouldSampleMock,
}));

const buildRequest = (): NextRequest =>
  new NextRequest('http://localhost:3000/api/test', {
    method: 'GET',
    headers: { 'x-real-ip': '203.0.113.7' },
  });

const buildContext = (): { params: Promise<unknown> } => ({ params: Promise.resolve({}) });

const responseWithStatus = (status: number): NextResponse =>
  ({ status }) as unknown as NextResponse;

beforeEach(() => {
  shouldSampleMock.mockReturnValue(true);
});

describe('withLogging', () => {
  it('logs sampled info for successful responses', async () => {
    const handler = vi.fn().mockResolvedValue(responseWithStatus(200));
    const wrapped = withLogging('TEST_ROUTE')(handler);

    const response = await wrapped(buildRequest(), buildContext());

    expect(response.status).toBe(200);
    expect(infoMock).toHaveBeenCalledWith(
      'Request ok',
      expect.objectContaining({
        path: '/api/test',
        method: 'GET',
        ip: '203.0.113.7',
        status: 200,
        durationMs: expect.any(Number),
      })
    );
  });

  it('skips success logging when sampled out', async () => {
    shouldSampleMock.mockReturnValue(false);
    const handler = vi.fn().mockResolvedValue(responseWithStatus(200));
    const wrapped = withLogging('TEST_ROUTE')(handler);

    await wrapped(buildRequest(), buildContext());

    expect(infoMock).not.toHaveBeenCalled();
  });

  it('logs a warning for 4xx responses', async () => {
    const handler = vi.fn().mockResolvedValue(responseWithStatus(404));
    const wrapped = withLogging('TEST_ROUTE')(handler);

    await wrapped(buildRequest(), buildContext());

    expect(warnMock).toHaveBeenCalledWith(
      'Request rejected',
      expect.objectContaining({ status: 404 })
    );
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('logs an error for 5xx responses', async () => {
    const handler = vi.fn().mockResolvedValue(responseWithStatus(503));
    const wrapped = withLogging('TEST_ROUTE')(handler);

    await wrapped(buildRequest(), buildContext());

    expect(errorMock).toHaveBeenCalledWith(
      'Request failed',
      undefined,
      expect.objectContaining({ status: 503 })
    );
  });

  it('runs the handler inside a request context seeded from x-request-id', async () => {
    let seenRequestId: string | undefined;
    const handler = vi.fn().mockImplementation(() => {
      seenRequestId = getRequestId();
      return Promise.resolve(responseWithStatus(200));
    });
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'GET',
      headers: { 'x-request-id': 'proxy-id-123' },
    });

    await withLogging('TEST_ROUTE')(handler)(request, buildContext());

    expect(seenRequestId).toBe('proxy-id-123');
    expect(getRequestId()).toBeUndefined();
  });

  it('logs and rethrows handler exceptions', async () => {
    const failure = new Error('handler exploded');
    const handler = vi.fn().mockRejectedValue(failure);
    const wrapped = withLogging('TEST_ROUTE')(handler);

    await expect(wrapped(buildRequest(), buildContext())).rejects.toThrow('handler exploded');
    expect(errorMock).toHaveBeenCalledWith(
      'Unhandled route error',
      failure,
      expect.objectContaining({ path: '/api/test' })
    );
  });
});

describe('logAction', () => {
  it('returns the action result and logs sampled success with context', async () => {
    const result = await logAction(
      'PAYMENTS',
      'createSession',
      { userId: 'user-1', data: { releaseId: 'rel-1' } },
      async () => 'done'
    );

    expect(result).toBe('done');
    expect(infoMock).toHaveBeenCalledWith(
      'Action completed: createSession',
      expect.objectContaining({
        action: 'createSession',
        userId: 'user-1',
        releaseId: 'rel-1',
        durationMs: expect.any(Number),
      })
    );
  });

  it('skips success logging when sampled out', async () => {
    shouldSampleMock.mockReturnValue(false);

    await logAction('PAYMENTS', 'createSession', {}, async () => 'done');

    expect(infoMock).not.toHaveBeenCalled();
  });

  it('runs the action inside a minted request context', async () => {
    const seen = await logAction('PAYMENTS', 'createSession', {}, async () => getRequestId());

    expect(seen).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('logs and rethrows action failures', async () => {
    const failure = new Error('stripe down');

    await expect(
      logAction('PAYMENTS', 'createSession', { userId: 'user-1' }, async () => {
        throw failure;
      })
    ).rejects.toThrow('stripe down');

    expect(errorMock).toHaveBeenCalledWith(
      'Action failed: createSession',
      failure,
      expect.objectContaining({ action: 'createSession', userId: 'user-1' })
    );
  });
});
