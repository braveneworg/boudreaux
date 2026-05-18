/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const authMock = vi.fn();
const submitMock = vi.fn();
const dispatchMock = vi.fn();
const headersMock = vi.fn();

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('@/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/services/abuse-report-service', () => ({
  AbuseReportService: { submit: submitMock },
}));

vi.mock('@/lib/services/abuse-report-notifications', () => ({
  dispatchAbuseReportNotifications: dispatchMock,
}));

vi.mock('@/lib/utils/visitor-fingerprint', () => ({
  computeFingerprintHash: vi.fn(() => 'fp-hash'),
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    chat: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

const buildHeaders = () => ({
  get: (name: string) => {
    if (name === 'user-agent') return 'test-ua';
    if (name === 'accept-language') return 'en-US';
    if (name === 'x-real-ip') return '203.0.113.4';
    return null;
  },
});

const { submitAbuseReportAction } = await import('./submit-abuse-report-action');

describe('submitAbuseReportAction', () => {
  beforeEach(() => {
    authMock.mockReset();
    submitMock.mockReset();
    dispatchMock.mockReset();
    headersMock.mockResolvedValue(buildHeaders());
  });

  it('returns unauthorized when there is no session', async () => {
    authMock.mockResolvedValue(null);

    const result = await submitAbuseReportAction({ reportedUsername: 'target' });

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('rejects an empty username as invalid', async () => {
    authMock.mockResolvedValue({ user: { id: 'r1' } });

    const result = await submitAbuseReportAction({ reportedUsername: '' });

    expect(result.success).toBe(false);
    const failure = !result.success ? result : null;
    expect(failure?.error).toBe('invalid');
    expect(failure?.fieldErrors?.reportedUsername).toBeDefined();
  });

  it('passes the auth session id (never client input) as the reporter id', async () => {
    authMock.mockResolvedValue({ user: { id: 'session-r1' } });
    submitMock.mockResolvedValue({ ok: true });
    dispatchMock.mockResolvedValue(undefined);

    await submitAbuseReportAction({ reportedUsername: 'target' });

    expect(submitMock).toHaveBeenCalledWith({
      reporterId: 'session-r1',
      reportedUsername: 'target',
      reporterFingerprint: 'fp-hash',
    });
  });

  it('fans out admin notifications on success', async () => {
    authMock.mockResolvedValue({ user: { id: 'r1' } });
    submitMock.mockResolvedValue({ ok: true });
    dispatchMock.mockResolvedValue(undefined);

    const result = await submitAbuseReportAction({ reportedUsername: 'target' });

    expect(result).toEqual({ success: true });
    expect(dispatchMock).toHaveBeenCalledWith({ reportedUsername: 'target' });
  });

  it('surfaces rate_limited results with retryAfterSeconds', async () => {
    authMock.mockResolvedValue({ user: { id: 'r1' } });
    submitMock.mockResolvedValue({
      ok: false,
      code: 'rate_limited',
      tier: 'pair',
      retryAfterSeconds: 30,
    });

    const result = await submitAbuseReportAction({ reportedUsername: 'target' });

    expect(result).toEqual({
      success: false,
      error: 'rate_limited',
      retryAfterSeconds: 30,
    });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('surfaces self_report results', async () => {
    authMock.mockResolvedValue({ user: { id: 'r1' } });
    submitMock.mockResolvedValue({ ok: false, code: 'self_report' });

    const result = await submitAbuseReportAction({ reportedUsername: 'r1' });

    expect(result).toEqual({ success: false, error: 'self_report' });
  });

  it('does not let a notification failure mask the success result', async () => {
    authMock.mockResolvedValue({ user: { id: 'r1' } });
    submitMock.mockResolvedValue({ ok: true });
    dispatchMock.mockRejectedValue(Error('SES blip'));

    const result = await submitAbuseReportAction({ reportedUsername: 'target' });

    expect(result).toEqual({ success: true });
  });
});
