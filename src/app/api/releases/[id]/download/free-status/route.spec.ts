// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import {
  CapReachedError,
  freeDownloadQuotaService,
} from '@/lib/services/free-download-quota-service';
import type * as FreeDownloadQuotaServiceModule from '@/lib/services/free-download-quota-service';
import { ReleaseService } from '@/lib/services/release-service';
import { readGuestVisitorId, setGuestVisitorIdCookie } from '@/lib/utils/guest-visitor-id';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) =>
    (handler: (req: unknown, ctx: unknown) => unknown) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx),
  extractClientIp: () => '203.0.113.42',
}));

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: {},
  DOWNLOAD_LIMIT: 10,
}));

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: { existsById: vi.fn() },
}));

vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: vi.fn(),
}));

vi.mock('@/lib/services/free-download-quota-service', async () => {
  const actual = await vi.importActual<typeof FreeDownloadQuotaServiceModule>(
    '@/lib/services/free-download-quota-service'
  );
  return {
    ...actual,
    freeDownloadQuotaService: {
      resolveVisitorIdentity: vi.fn(),
      assertFreeDownloadAllowed: vi.fn(),
    },
  };
});

vi.mock('@/lib/utils/guest-visitor-id', () => ({
  readGuestVisitorId: vi.fn(),
  setGuestVisitorIdCookie: vi.fn(),
}));

const validReleaseId = '507f1f77bcf86cd799439011';

function buildRequest(): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/releases/${validReleaseId}/download/free-status`,
    { headers: { 'user-agent': 'test-agent', 'accept-language': 'en-US' } }
  );
}

const dummyContext = { params: Promise.resolve({ id: validReleaseId }) };

describe('GET /api/releases/[id]/download/free-status', () => {
  beforeEach(() => {
    vi.mocked(ReleaseService.existsById).mockReset().mockResolvedValue(true);
    vi.mocked(ReleaseDigitalFormatRepository)
      .mockReset()
      .mockImplementation(function () {
        return {
          findAllByRelease: vi
            .fn()
            .mockResolvedValue([
              { formatType: 'MP3_320KBPS' },
              { formatType: 'AAC' },
              { formatType: 'FLAC' },
            ]),
        } as never;
      } as never);
    vi.mocked(freeDownloadQuotaService.resolveVisitorIdentity)
      .mockReset()
      .mockResolvedValue({
        primaryVisitorId: 'visitor-1',
        allVisitorIds: ['visitor-1'],
        cookieReissue: false,
      });
    vi.mocked(freeDownloadQuotaService.assertFreeDownloadAllowed).mockReset().mockResolvedValue({
      allowed: true,
      remaining: 3,
      count: 0,
      oldestInWindow: null,
      resetsAt: null,
    });
    vi.mocked(readGuestVisitorId).mockReset().mockResolvedValue('visitor-1');
    vi.mocked(setGuestVisitorIdCookie).mockReset().mockResolvedValue(undefined);
  });

  it('returns 200 with allowed=true and full availableFreeFormats on first hit', async () => {
    const response = await GET(buildRequest(), dummyContext);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      allowed: true,
      remaining: 3,
      windowSeconds: 86_400,
      resetsAtIso: null,
      blockedReason: null,
      availableFreeFormats: ['MP3_320KBPS', 'AAC'],
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('issues boudreaux_visitor_id cookie when identity resolution signals reissue', async () => {
    vi.mocked(readGuestVisitorId).mockResolvedValue(null);
    vi.mocked(freeDownloadQuotaService.resolveVisitorIdentity).mockResolvedValue({
      primaryVisitorId: 'minted-uuid',
      allVisitorIds: ['minted-uuid'],
      cookieReissue: true,
    });

    await GET(buildRequest(), dummyContext);
    expect(setGuestVisitorIdCookie).toHaveBeenCalledWith('minted-uuid');
  });

  it('does not re-issue cookie when valid cookie is present', async () => {
    await GET(buildRequest(), dummyContext);
    expect(setGuestVisitorIdCookie).not.toHaveBeenCalled();
  });

  it('returns 404 when the release does not exist', async () => {
    vi.mocked(ReleaseService.existsById).mockResolvedValue(false);
    const response = await GET(buildRequest(), dummyContext);
    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid releaseId format', async () => {
    const response = await GET(buildRequest(), {
      params: Promise.resolve({ id: 'not-an-objectid' }),
    });
    expect(response.status).toBe(400);
  });

  it('intersects FREE_FORMAT_TYPES with published formats correctly', async () => {
    vi.mocked(ReleaseDigitalFormatRepository).mockImplementation(function () {
      return {
        findAllByRelease: vi
          .fn()
          .mockResolvedValue([{ formatType: 'MP3_320KBPS' }, { formatType: 'WAV' }]),
      } as never;
    } as never);

    const response = await GET(buildRequest(), dummyContext);
    const body = await response.json();
    expect(body.availableFreeFormats).toEqual(['MP3_320KBPS']);
  });

  it('returns blockedReason="no-free-formats" when intersection is empty', async () => {
    vi.mocked(ReleaseDigitalFormatRepository).mockImplementation(function () {
      return {
        findAllByRelease: vi.fn().mockResolvedValue([{ formatType: 'FLAC' }]),
      } as never;
    } as never);

    const response = await GET(buildRequest(), dummyContext);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      allowed: false,
      remaining: 0,
      windowSeconds: 86_400,
      resetsAtIso: null,
      blockedReason: 'no-free-formats',
      availableFreeFormats: [],
    });
  });

  it('returns cap-reached payload when assertFreeDownloadAllowed throws CapReachedError', async () => {
    const resetsAt = new Date('2026-05-08T18:00:00.000Z');
    vi.mocked(freeDownloadQuotaService.assertFreeDownloadAllowed).mockRejectedValue(
      new CapReachedError(resetsAt)
    );

    const response = await GET(buildRequest(), dummyContext);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      allowed: false,
      remaining: 0,
      windowSeconds: 86_400,
      resetsAtIso: resetsAt.toISOString(),
      blockedReason: 'cap-reached',
      availableFreeFormats: ['MP3_320KBPS', 'AAC'],
    });
  });

  it('rethrows non-CapReachedError failures from assertFreeDownloadAllowed', async () => {
    // A non-cap error is not a CapReachedError, so the catch re-throws it
    // (the route does not swallow unexpected failures).
    const unexpected = new Error('quota service exploded');
    vi.mocked(freeDownloadQuotaService.assertFreeDownloadAllowed).mockRejectedValue(unexpected);

    await expect(GET(buildRequest(), dummyContext)).rejects.toThrow('quota service exploded');
  });

  it('passes union of all visitorIds to assertFreeDownloadAllowed (identity-conflict union)', async () => {
    // Cookie + fingerprint resolve to two different existing rows. Cap query
    // must union the events so cookie-cleared sessions cannot reset the cap.
    vi.mocked(freeDownloadQuotaService.resolveVisitorIdentity).mockResolvedValueOnce({
      primaryVisitorId: 'visitor-cookie',
      allVisitorIds: ['visitor-cookie', 'visitor-fingerprint'],
      cookieReissue: false,
    });
    vi.mocked(freeDownloadQuotaService.assertFreeDownloadAllowed).mockRejectedValueOnce(
      new CapReachedError(new Date('2026-05-08T18:00:00.000Z'))
    );

    const response = await GET(buildRequest(), dummyContext);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.allowed).toBe(false);
    expect(body.blockedReason).toBe('cap-reached');
    expect(freeDownloadQuotaService.assertFreeDownloadAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        visitorIds: ['visitor-cookie', 'visitor-fingerprint'],
      })
    );
  });
});
