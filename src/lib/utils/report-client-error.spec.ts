/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { reportClientError } from './report-client-error';

describe('reportClientError', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { pathname: '/releases/abc' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastPayload = (): Record<string, unknown> => {
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body) as Record<string, unknown>;
  };

  it('posts digest, message, pathname, and boundary', () => {
    const error = Object.assign(new Error('boom'), { digest: 'digest-123' });
    reportClientError(error, 'route');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/client-errors',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      })
    );
    expect(lastPayload()).toEqual({
      digest: 'digest-123',
      message: 'boom',
      pathname: '/releases/abc',
      boundary: 'route',
    });
  });

  it('omits the digest when absent and truncates long messages', () => {
    reportClientError(new Error('x'.repeat(600)), 'global');

    const payload = lastPayload();
    expect(payload.digest).toBeUndefined();
    expect((payload.message as string).length).toBe(500);
    expect(payload.boundary).toBe('global');
  });

  it('falls back to a default message and unknown pathname', () => {
    vi.stubGlobal('location', undefined);
    reportClientError(new Error(''), 'route');

    expect(lastPayload()).toMatchObject({
      message: 'Unknown client error',
      pathname: 'unknown',
    });
  });

  it('swallows fetch rejections', () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    expect(() => reportClientError(new Error('boom'), 'route')).not.toThrow();
  });

  it('swallows a missing fetch implementation', () => {
    vi.stubGlobal('fetch', undefined);

    expect(() => reportClientError(new Error('boom'), 'route')).not.toThrow();
  });
});
