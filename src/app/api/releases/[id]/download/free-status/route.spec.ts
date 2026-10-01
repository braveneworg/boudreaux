/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { downloadGate } from '@/lib/services/download-gate/download-gate';
import type { DownloadStatus } from '@/lib/services/download-gate/types';
import { resolveDownloadSubject } from '@/lib/utils/resolve-download-subject';

import { GET } from './route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit: () => (handler: unknown) => handler,
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({ DOWNLOAD_LIMIT: 10, downloadLimiter: {} }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/services/download-gate/download-gate', () => ({
  downloadGate: { status: vi.fn() },
}));
vi.mock('@/lib/utils/resolve-download-subject', () => ({
  resolveDownloadSubject: vi.fn(),
}));

const validReleaseId = '507f1f77bcf86cd799439011';
const RESET_AT = new Date('2026-10-02T11:00:00.000Z');

const buildRequest = (): NextRequest =>
  new NextRequest(`http://localhost:3000/api/releases/${validReleaseId}/download/free-status`, {
    headers: { 'user-agent': 'test-agent', 'accept-language': 'en-US' },
  });

const context = { params: Promise.resolve({ id: validReleaseId }) };

const freeStatus = (overrides: Partial<DownloadStatus> = {}): DownloadStatus => ({
  entitled: false,
  mode: 'free',
  availableFreeFormats: ['MP3_320KBPS', 'AAC'],
  freeThrottle: { allowed: true, remaining: 3, resetsAt: null },
  lifetime: null,
  purchaseThrottle: null,
  ...overrides,
});

describe('GET /api/releases/[id]/download/free-status', () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    vi.mocked(resolveDownloadSubject).mockResolvedValue({ kind: 'guest', visitorId: 'visitor-1' });
    vi.mocked(downloadGate.status).mockResolvedValue(freeStatus());
  });

  it('returns the free-tier status for a guest', async () => {
    const response = await GET(buildRequest(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      remaining: 3,
      windowSeconds: 86_400,
      resetsAtIso: null,
      blockedReason: null,
      availableFreeFormats: ['MP3_320KBPS', 'AAC'],
    });
    expect(vi.mocked(downloadGate.status).mock.calls).toEqual([
      [{ kind: 'guest', visitorId: 'visitor-1' }, validReleaseId],
    ]);
  });

  it('asks the gate about the signed-in user, not a guest, when there is a session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(resolveDownloadSubject).mockResolvedValue({ kind: 'user', userId: 'user-1' });

    await GET(buildRequest(), context);

    expect(vi.mocked(resolveDownloadSubject).mock.calls).toEqual([
      [expect.any(NextRequest), 'user-1'],
    ]);
    expect(vi.mocked(downloadGate.status).mock.calls[0]?.[0]).toEqual({
      kind: 'user',
      userId: 'user-1',
    });
  });

  it('reports cap-reached with the reset moment when the free throttle is exhausted', async () => {
    vi.mocked(downloadGate.status).mockResolvedValue(
      freeStatus({ freeThrottle: { allowed: false, remaining: 0, resetsAt: RESET_AT } })
    );

    const body = await (await GET(buildRequest(), context)).json();

    expect(body).toMatchObject({
      allowed: false,
      remaining: 0,
      resetsAtIso: RESET_AT.toISOString(),
      blockedReason: 'cap-reached',
    });
  });

  it('reports no-free-formats when the release has none the free tier may take', async () => {
    vi.mocked(downloadGate.status).mockResolvedValue(freeStatus({ availableFreeFormats: [] }));

    const body = await (await GET(buildRequest(), context)).json();

    expect(body).toMatchObject({ allowed: false, remaining: 0, blockedReason: 'no-free-formats' });
  });

  it('returns 404 when the gate knows no such listed release', async () => {
    vi.mocked(downloadGate.status).mockResolvedValue(null);

    const response = await GET(buildRequest(), context);

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid releaseId', async () => {
    const response = await GET(buildRequest(), { params: Promise.resolve({ id: 'nope' }) });

    expect(response.status).toBe(400);
    expect(downloadGate.status).not.toHaveBeenCalled();
  });

  it('sends no-store on every response', async () => {
    const response = await GET(buildRequest(), context);

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
