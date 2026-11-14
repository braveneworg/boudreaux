// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { onRequestError, register } from './instrumentation';

const errorMock = vi.hoisted(() => vi.fn());
const runBootCheckMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/config/boot-check', () => ({ runBootCheck: runBootCheckMock }));

const startMonitorMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/submission-overdue-reminder', () => ({
  startOverdueReminderMonitor: startMonitorMock,
}));

const startErasureMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/submission-report-contact-erasure', () => ({
  startReportContactErasureMonitor: startErasureMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  createLogger: vi.fn(() => ({ error: errorMock })),
}));

const request = {
  path: '/artists/abc',
  method: 'GET',
  headers: { cookie: 'secret-session' },
};

const context = {
  routerKind: 'App Router',
  routePath: '/artists/[slug]',
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
        path: '/artists/abc',
        method: 'GET',
        routePath: '/artists/[slug]',
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

describe('register', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs the runtime config boot check on the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await register();

    expect(runBootCheckMock.mock.calls).toEqual([[]]);
  });

  it('skips the boot check on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    await register();

    expect(runBootCheckMock).not.toHaveBeenCalled();
  });

  it('starts the overdue reminder on the production nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_MODE', '');

    await register();

    expect(startMonitorMock).toHaveBeenCalledTimes(1);
  });

  it('starts the report contact erasure on the production nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_MODE', '');

    await register();

    expect(startErasureMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['in development', 'development', ''],
    ['under test', 'test', ''],
    ['in an E2E production build', 'production', 'true'],
  ])('does not start the report contact erasure %s', async (_name, nodeEnv, e2eMode) => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('E2E_MODE', e2eMode);

    await register();

    expect(startErasureMock).not.toHaveBeenCalled();
  });

  it('does not start the report contact erasure on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('NODE_ENV', 'production');

    await register();

    expect(startErasureMock).not.toHaveBeenCalled();
  });

  it.each([
    ['in development', 'development', ''],
    ['under test', 'test', ''],
    ['in an E2E production build', 'production', 'true'],
  ])('does not start the overdue reminder %s', async (_name, nodeEnv, e2eMode) => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('E2E_MODE', e2eMode);

    await register();

    expect(startMonitorMock).not.toHaveBeenCalled();
  });

  it('does not start the overdue reminder on the edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('NODE_ENV', 'production');

    await register();

    expect(startMonitorMock).not.toHaveBeenCalled();
  });

  it('does not start the overdue reminder when the boot check fails', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    runBootCheckMock.mockImplementationOnce(() => {
      throw new Error('Missing required environment variables: AUTH_URL');
    });

    await expect(register()).rejects.toThrow();
    expect(startMonitorMock).not.toHaveBeenCalled();
  });

  it('lets a failed boot check fail registration', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    runBootCheckMock.mockImplementationOnce(() => {
      throw new Error('Missing required environment variables: AUTH_URL');
    });

    await expect(register()).rejects.toThrow('Missing required environment variables: AUTH_URL');
  });
});
