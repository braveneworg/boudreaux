// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { onRequestError } from './instrumentation';

const errorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({ error: errorMock })),
}));

const request = {
  path: '/releases/abc',
  method: 'GET',
  headers: { cookie: 'secret-session' },
};

const context = {
  routerKind: 'App Router',
  routePath: '/releases/[id]',
  routeType: 'render',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
} as const;

describe('onRequestError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing outside the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    await onRequestError(new Error('boom'), request, { ...context });

    expect(errorMock).not.toHaveBeenCalled();
  });

  it('logs uncaught errors with request and route context', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const error = Object.assign(new Error('boom'), { digest: 'digest-9' });

    await onRequestError(error, request, { ...context });

    expect(errorMock).toHaveBeenCalledWith(
      'Unhandled server error',
      error,
      expect.objectContaining({
        digest: 'digest-9',
        path: '/releases/abc',
        method: 'GET',
        routePath: '/releases/[id]',
        routeType: 'render',
        routerKind: 'App Router',
        renderSource: 'react-server-components',
      })
    );
  });

  it('never logs request headers', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await onRequestError(new Error('boom'), request, { ...context });

    const meta = errorMock.mock.calls[0][2] as Record<string, unknown>;
    expect(meta.headers).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain('secret-session');
  });

  it('omits the digest for non-object errors', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await onRequestError('string failure', request, { ...context });

    const meta = errorMock.mock.calls[0][2] as Record<string, unknown>;
    expect(meta.digest).toBeUndefined();
  });
});
