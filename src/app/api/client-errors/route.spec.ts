// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { POST } from './route';

const limiterCheckMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  clientErrorLimiter: { check: limiterCheckMock },
  CLIENT_ERROR_LIMIT: 5,
}));

vi.mock('@/lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({ warn: warnMock })),
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

const buildRequest = (body: string): NextRequest =>
  new NextRequest('http://localhost:3000/api/client-errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': '203.0.113.7',
      'user-agent': 'vitest',
    },
    body,
  });

const validReport = {
  digest: 'digest-123',
  message: 'Something exploded',
  pathname: '/releases/abc',
  boundary: 'route',
};

beforeEach(() => {
  limiterCheckMock.mockResolvedValue(undefined);
});

describe('POST /api/client-errors', () => {
  it('logs a valid report and returns 204', async () => {
    const response = await POST(buildRequest(JSON.stringify(validReport)), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(204);
    expect(warnMock).toHaveBeenCalledWith(
      'Client-side error reported',
      expect.objectContaining({
        digest: 'digest-123',
        message: 'Something exploded',
        pathname: '/releases/abc',
        boundary: 'route',
        ip: '203.0.113.7',
        userAgent: 'vitest',
      })
    );
  });

  it('rejects a payload that fails validation', async () => {
    const response = await POST(buildRequest(JSON.stringify({ message: '' })), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(400);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(buildRequest('{not json'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(400);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads with 413', async () => {
    const oversized = JSON.stringify({ ...validReport, message: 'x'.repeat(3000) });
    const response = await POST(buildRequest(oversized), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(413);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await POST(buildRequest(JSON.stringify(validReport)), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(429);
    expect(warnMock).not.toHaveBeenCalled();
  });
});
