/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';

import { extractClientIp, withRateLimit } from './with-rate-limit';

vi.mock('server-only', () => ({}));

vi.mock('next/server', () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }

    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }

  return { NextResponse: MockNextResponse };
});

const createMockRequest = (headers: Record<string, string> = {}): NextRequest => {
  const headerMap = new Map(Object.entries(headers));
  return {
    headers: {
      get: (name: string) => headerMap.get(name) ?? null,
    },
  } as unknown as NextRequest;
};

describe('extractClientIp', () => {
  it('should prefer x-real-ip header', () => {
    const request = createMockRequest({
      'x-real-ip': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8, 9.10.11.12',
    });
    expect(extractClientIp(request)).toBe('1.2.3.4');
  });

  it('should fall back to x-forwarded-for first entry', () => {
    const request = createMockRequest({
      'x-forwarded-for': '5.6.7.8, 9.10.11.12',
    });
    expect(extractClientIp(request)).toBe('5.6.7.8');
  });

  it('should return anonymous when no IP headers are present', () => {
    const request = createMockRequest();
    expect(extractClientIp(request)).toBe('anonymous');
  });
});

describe('withRateLimit', () => {
  const mockHandler = vi.fn();
  const mockLimiter = { check: vi.fn() };
  const mockContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.resetAllMocks();
    mockHandler.mockResolvedValue({ status: 200, body: 'ok' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should call the handler when rate limit is not exceeded', async () => {
    mockLimiter.check.mockResolvedValue(undefined);
    const wrapped = withRateLimit(mockLimiter, 10)(mockHandler);

    await wrapped(createMockRequest({ 'x-real-ip': '1.2.3.4' }), mockContext);

    expect(mockLimiter.check).toHaveBeenCalledWith(10, '1.2.3.4');
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should return 429 when rate limit is exceeded', async () => {
    mockLimiter.check.mockRejectedValue(new Error('Rate limit exceeded'));
    const wrapped = withRateLimit(mockLimiter, 10)(mockHandler);

    const response = await wrapped(createMockRequest({ 'x-real-ip': '1.2.3.4' }), mockContext);

    expect(response).toMatchObject({ status: 429 });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should skip rate limiting when E2E_MODE is true', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    const wrapped = withRateLimit(mockLimiter, 10)(mockHandler);

    await wrapped(createMockRequest({ 'x-real-ip': '1.2.3.4' }), mockContext);

    expect(mockLimiter.check).not.toHaveBeenCalled();
    expect(mockHandler).toHaveBeenCalled();
  });
});
