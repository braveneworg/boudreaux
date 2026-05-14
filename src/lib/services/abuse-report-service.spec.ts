/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const findUniqueMock = vi.fn();
const createReportMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: findUniqueMock },
  },
}));

vi.mock('@/lib/repositories/abuse-report-repository', () => ({
  AbuseReportRepository: {
    create: createReportMock,
  },
}));

vi.mock('@/lib/utils/abuse-report-rate-limit', () => ({
  checkAbuseReportRateLimit: rateLimitMock,
}));

const { AbuseReportService } = await import('./abuse-report-service');

describe('AbuseReportService.submit', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    createReportMock.mockReset();
    rateLimitMock.mockReset();
  });

  it('returns ok:true and skips persistence when the username is empty', async () => {
    const result = await AbuseReportService.submit({
      reporterId: 'r1',
      reportedUsername: '   ',
      reporterFingerprint: 'fp',
    });
    expect(result.ok).toBe(true);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createReportMock).not.toHaveBeenCalled();
  });

  it('returns ok:true silently when the username does not resolve (no enumeration oracle)', async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await AbuseReportService.submit({
      reporterId: 'r1',
      reportedUsername: 'ghost',
      reporterFingerprint: 'fp',
    });
    expect(result.ok).toBe(true);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(createReportMock).not.toHaveBeenCalled();
  });

  it('rejects self-reports with code=self_report', async () => {
    findUniqueMock.mockResolvedValue({ id: 'r1', username: 'me', email: 'me@x.com' });
    const result = await AbuseReportService.submit({
      reporterId: 'r1',
      reportedUsername: 'me',
      reporterFingerprint: 'fp',
    });
    expect(result).toEqual({ ok: false, code: 'self_report' });
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it('returns rate_limited with the tier + retryAfterSeconds', async () => {
    findUniqueMock.mockResolvedValue({ id: 't1', username: 'target', email: 't@x.com' });
    rateLimitMock.mockResolvedValue({
      success: false,
      blockedBy: 'pair',
      retryAfterSeconds: 42,
    });

    const result = await AbuseReportService.submit({
      reporterId: 'r1',
      reportedUsername: 'target',
      reporterFingerprint: 'fp',
    });

    expect(result).toEqual({
      ok: false,
      code: 'rate_limited',
      tier: 'pair',
      retryAfterSeconds: 42,
    });
    expect(createReportMock).not.toHaveBeenCalled();
  });

  it('persists the report when validation + rate limit pass', async () => {
    findUniqueMock.mockResolvedValue({ id: 't1', username: 'target', email: 't@x.com' });
    rateLimitMock.mockResolvedValue({ success: true, blockedBy: null });
    createReportMock.mockResolvedValue({ id: 'rep1' });

    const result = await AbuseReportService.submit({
      reporterId: 'r1',
      reportedUsername: 'target',
      reporterFingerprint: 'fp-hash',
    });

    expect(result).toEqual({ ok: true });
    expect(createReportMock).toHaveBeenCalledWith({
      reportedUserId: 't1',
      reporterId: 'r1',
      reporterFingerprint: 'fp-hash',
    });
  });

  it('returns unknown_error when persistence throws', async () => {
    findUniqueMock.mockResolvedValue({ id: 't1', username: 'target', email: 't@x.com' });
    rateLimitMock.mockResolvedValue({ success: true, blockedBy: null });
    createReportMock.mockRejectedValue(Error('db down'));

    const result = await AbuseReportService.submit({
      reporterId: 'r1',
      reportedUsername: 'target',
      reporterFingerprint: 'fp',
    });

    expect(result).toEqual({ ok: false, code: 'unknown_error' });
  });
});
