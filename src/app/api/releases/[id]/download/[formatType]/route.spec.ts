/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { downloadGate } from '@/lib/services/download-gate/download-gate';
import type { GateFormatRecord } from '@/lib/services/download-gate/download-gate';
import type { Grant } from '@/lib/services/download-gate/types';
import { generatePresignedDownloadUrl } from '@/lib/utils/s3-client';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/decorators/with-logging', () => ({
  withLogging: () => (handler: unknown) => handler,
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  DOWNLOAD_LIMIT: 10,
  downloadLimiter: { check: vi.fn() },
}));
vi.mock('@/lib/services/download-gate/download-gate', () => ({
  downloadGate: { download: vi.fn() },
}));
vi.mock('@/lib/utils/s3-client', () => ({ generatePresignedDownloadUrl: vi.fn() }));

const RELEASE_ID = '507f1f77bcf86cd799439011';
const USER = { user: { id: 'user-1', role: 'user' } };

const request = (headers: Record<string, string> = { 'user-agent': 'spec' }) =>
  new NextRequest(`http://localhost:3000/api/releases/${RELEASE_ID}/download/AAC`, { headers });
const params = (formatType = 'AAC', id = RELEASE_ID) => ({
  params: Promise.resolve({ id, formatType }),
});

const legacyRecord = (overrides: Partial<GateFormatRecord> = {}): GateFormatRecord =>
  ({
    id: 'fmt-1',
    formatType: 'AAC',
    s3Key: 'releases/r/aac.zip',
    fileName: 'album-aac.zip',
    deletedAt: null,
    files: [],
    ...overrides,
  }) as unknown as GateFormatRecord;

const grant: Grant = {
  kind: 'grant',
  mode: 'free',
  formats: [{ formatType: 'AAC', withdrawn: false }],
  charge: { lifetime: true, freeThrottle: true, purchaseThrottle: false },
};

/** Make the gate run the route's producer against `records` and return its outcome. */
const gateGrants = (records: GateFormatRecord[]) =>
  vi.mocked(downloadGate.download).mockImplementation(async (_request, produce) => ({
    ok: true,
    grant,
    deliverable: await produce(grant, records),
  }));

describe('GET /api/releases/[id]/download/[formatType]', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(USER);
    vi.stubEnv('E2E_MODE', 'true');
    vi.mocked(generatePresignedDownloadUrl).mockResolvedValue('https://s3/presigned');
  });

  it('returns 401 without a session (withAuth)', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(request(), params());

    expect(response.status).toBe(401);
    expect(downloadGate.download).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid release id or format type', async () => {
    expect((await GET(request(), params('AAC', 'nope'))).status).toBe(400);
    expect((await GET(request(), params('MP3'))).status).toBe(400);
    expect(downloadGate.download).not.toHaveBeenCalled();
  });

  it('asks the gate for the signed-in user and the one format, with the audit context', async () => {
    gateGrants([legacyRecord()]);

    await GET(request({ 'user-agent': 'spec', 'x-forwarded-for': '203.0.113.9' }), params());

    const [gateRequest, , audit] = vi.mocked(downloadGate.download).mock.calls[0];
    expect(gateRequest).toEqual({
      subject: { kind: 'user', userId: 'user-1' },
      releaseId: RELEASE_ID,
      formats: ['AAC'],
    });
    expect(audit).toEqual({ ipAddress: '203.0.113.9', userAgent: 'spec' });
  });

  it('returns a presigned URL for a legacy single-file format', async () => {
    gateGrants([legacyRecord()]);

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      downloadUrl: 'https://s3/presigned',
      fileName: 'album-aac.zip',
    });
    expect(typeof body.expiresAt).toBe('string');
    expect(vi.mocked(generatePresignedDownloadUrl).mock.calls).toEqual([
      ['releases/r/aac.zip', 'album-aac.zip'],
    ]);
  });

  it("refuses a multi-track format: that is the bundle route's job", async () => {
    gateGrants([legacyRecord({ s3Key: null, fileName: null, files: [{ id: 'f1' }] } as never)]);

    const response = await GET(request(), params());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: 'MULTI_TRACK' });
  });

  it.each([
    [{ ok: false, denial: null, reason: 'NOT_FOUND' }, 404, 'NOT_FOUND'],
    [{ ok: false, denial: null, reason: 'LOCK_HELD' }, 409, 'LOCK_HELD'],
    [
      { ok: false, denial: { kind: 'denial', reason: 'PURCHASE_REQUIRED', formats: ['AAC'] } },
      403,
      'PURCHASE_REQUIRED',
    ],
    [{ ok: false, denial: { kind: 'denial', reason: 'LIFETIME_CAP' } }, 403, 'QUOTA_EXCEEDED'],
    [
      { ok: false, denial: { kind: 'denial', reason: 'THROTTLED', resetsAt: new Date() } },
      403,
      'CAP_REACHED',
    ],
    [
      { ok: false, denial: { kind: 'denial', reason: 'DELETED', formats: ['AAC'] } },
      410,
      'DELETED',
    ],
  ] as const)('maps a refusal to its HTTP shape (%o → %i)', async (outcome, status, error) => {
    vi.mocked(downloadGate.download).mockResolvedValue(outcome as never);

    const response = await GET(request(), params());

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ success: false, error });
  });

  it('returns 429 when the rate limiter rejects outside E2E mode', async () => {
    vi.stubEnv('E2E_MODE', '');
    const { downloadLimiter } = await import('@/lib/config/rate-limit-tiers');
    vi.mocked(downloadLimiter.check).mockRejectedValueOnce(new Error('limited'));

    const response = await GET(request(), params());

    expect(response.status).toBe(429);
    expect(downloadGate.download).not.toHaveBeenCalled();
  });

  it('returns 500 when the gate throws', async () => {
    vi.mocked(downloadGate.download).mockRejectedValue(new Error('boom'));

    const response = await GET(request(), params());

    expect(response.status).toBe(500);
  });
});
