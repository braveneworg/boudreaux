/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { VisitorIdentityRepository } from '@/lib/repositories/visitor-identity-repository';
import {
  CapReachedError,
  FREE_DOWNLOAD_CAP,
  FREE_DOWNLOAD_WINDOW_MS,
  FreeDownloadQuotaService,
} from '@/lib/services/free-download-quota-service';
import type { VisitorIdentityRecord } from '@/lib/types/domain/visitor-identity';
import type { DownloadSubject } from '@/types/download-subject';

vi.mock('server-only', () => ({}));

const makeRow = (overrides?: Partial<VisitorIdentityRecord>): VisitorIdentityRecord =>
  ({
    id: 'vi-1',
    visitorId: 'visitor-cookie',
    fingerprintHash: 'a'.repeat(64),
    firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    lastSeenAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as VisitorIdentityRecord;

describe('FreeDownloadQuotaService', () => {
  const now = new Date('2026-05-08T12:00:00Z');
  const releaseId = 'release-1';
  const fingerprintHash = 'a'.repeat(64);

  let visitorRepo: VisitorIdentityRepository;
  let eventRepo: DownloadEventRepository;
  let mintVisitorId: ReturnType<typeof vi.fn> & (() => string);
  let service: FreeDownloadQuotaService;

  beforeEach(() => {
    visitorRepo = new VisitorIdentityRepository();
    eventRepo = new DownloadEventRepository();
    mintVisitorId = vi.fn(() => 'minted-uuid');
    vi.spyOn(visitorRepo, 'findByVisitorId').mockResolvedValue(null);
    vi.spyOn(visitorRepo, 'findByFingerprintHash').mockResolvedValue(null);
    vi.spyOn(visitorRepo, 'upsert').mockImplementation(async ({ visitorId }) =>
      makeRow({ visitorId, fingerprintHash })
    );
    vi.spyOn(eventRepo, 'countSuccessfulDownloadsInWindow').mockResolvedValue({
      count: 0,
      oldestInWindow: null,
    });
    vi.spyOn(eventRepo, 'logDownloadEvent').mockResolvedValue({} as never);

    service = new FreeDownloadQuotaService(visitorRepo, eventRepo, mintVisitorId);
  });

  describe('resolveVisitorIdentity', () => {
    it('Branch 1: cookie valid + row exists → uses cookie value, no reissue', async () => {
      vi.mocked(visitorRepo.findByVisitorId).mockResolvedValue(makeRow({ visitorId: 'cookie-A' }));
      vi.mocked(visitorRepo.findByFingerprintHash).mockResolvedValue(
        makeRow({ visitorId: 'cookie-A' })
      );

      const result = await service.resolveVisitorIdentity({
        cookieValue: 'cookie-A',
        fingerprintHash,
        now,
      });

      expect(result).toEqual({
        primaryVisitorId: 'cookie-A',
        allVisitorIds: ['cookie-A'],
        cookieReissue: false,
      });
      expect(visitorRepo.upsert).toHaveBeenCalledWith(
        { visitorId: 'cookie-A', fingerprintHash },
        now
      );
      expect(mintVisitorId).not.toHaveBeenCalled();
    });

    it('Branch 1 + identity-conflict union: cookie hits row A, fingerprint hits row B → unions both ids', async () => {
      vi.mocked(visitorRepo.findByVisitorId).mockResolvedValue(makeRow({ visitorId: 'cookie-A' }));
      vi.mocked(visitorRepo.findByFingerprintHash).mockResolvedValue(
        makeRow({ visitorId: 'fingerprint-B', fingerprintHash })
      );

      const result = await service.resolveVisitorIdentity({
        cookieValue: 'cookie-A',
        fingerprintHash,
        now,
      });

      expect(result.primaryVisitorId).toBe('cookie-A');
      expect(result.allVisitorIds).toEqual(['cookie-A', 'fingerprint-B']);
      expect(result.cookieReissue).toBe(false);
      // Records are NOT merged — only one upsert against primary.
      expect(visitorRepo.upsert).toHaveBeenCalledTimes(1);
      expect(visitorRepo.upsert).toHaveBeenCalledWith(
        { visitorId: 'cookie-A', fingerprintHash },
        now
      );
    });

    it('Branch 2: cookie valid but no row → adopts cookie value, no reissue', async () => {
      vi.mocked(visitorRepo.findByVisitorId).mockResolvedValue(null);

      const result = await service.resolveVisitorIdentity({
        cookieValue: 'cookie-Z',
        fingerprintHash,
        now,
      });

      expect(result).toEqual({
        primaryVisitorId: 'cookie-Z',
        allVisitorIds: ['cookie-Z'],
        cookieReissue: false,
      });
      expect(visitorRepo.upsert).toHaveBeenCalledWith(
        { visitorId: 'cookie-Z', fingerprintHash },
        now
      );
      // Branch 2 must not consult fingerprint match (it was the cookie's first sighting).
      expect(visitorRepo.findByFingerprintHash).not.toHaveBeenCalled();
    });

    it('Branch 3: no cookie + fingerprint match → reissues cookie with matched id', async () => {
      vi.mocked(visitorRepo.findByFingerprintHash).mockResolvedValue(
        makeRow({ visitorId: 'recovered' })
      );

      const result = await service.resolveVisitorIdentity({
        cookieValue: null,
        fingerprintHash,
        now,
      });

      expect(result).toEqual({
        primaryVisitorId: 'recovered',
        allVisitorIds: ['recovered'],
        cookieReissue: true,
      });
      expect(mintVisitorId).not.toHaveBeenCalled();
      expect(visitorRepo.upsert).toHaveBeenCalledWith(
        { visitorId: 'recovered', fingerprintHash },
        now
      );
    });

    it('Branch 4: no cookie + no fingerprint match → mints a new UUID and reissues', async () => {
      const result = await service.resolveVisitorIdentity({
        cookieValue: null,
        fingerprintHash,
        now,
      });

      expect(mintVisitorId).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        primaryVisitorId: 'minted-uuid',
        allVisitorIds: ['minted-uuid'],
        cookieReissue: true,
      });
      expect(visitorRepo.upsert).toHaveBeenCalledWith(
        { visitorId: 'minted-uuid', fingerprintHash },
        now
      );
    });

    it('treats blank cookie strings as missing', async () => {
      const result = await service.resolveVisitorIdentity({
        cookieValue: '   ',
        fingerprintHash,
        now,
      });

      expect(result.cookieReissue).toBe(true);
      expect(result.primaryVisitorId).toBe('minted-uuid');
    });
  });

  describe('assertFreeDownloadAllowed', () => {
    const guestSubject: DownloadSubject = { kind: 'guest', visitorId: 'visitor-1' };
    const userSubject: DownloadSubject = { kind: 'user', userId: 'user-1' };

    it('returns allowed=true with remaining=3 when no events have been recorded', async () => {
      vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mockResolvedValue({
        count: 0,
        oldestInWindow: null,
      });

      const result = await service.assertFreeDownloadAllowed({
        subject: guestSubject,
        releaseId,
        now,
      });

      expect(result).toEqual({
        allowed: true,
        remaining: FREE_DOWNLOAD_CAP,
        count: 0,
        oldestInWindow: null,
        resetsAt: null,
      });
    });

    it('returns remaining=1 with resetsAt when count=2', async () => {
      const oldest = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5h ago
      vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mockResolvedValue({
        count: 2,
        oldestInWindow: oldest,
      });

      const result = await service.assertFreeDownloadAllowed({
        subject: guestSubject,
        releaseId,
        now,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      expect(result.count).toBe(2);
      expect(result.resetsAt).toEqual(new Date(oldest.getTime() + FREE_DOWNLOAD_WINDOW_MS));
    });

    it('throws CapReachedError when count >= 3', async () => {
      const oldest = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mockResolvedValue({
        count: 3,
        oldestInWindow: oldest,
      });

      await expect(
        service.assertFreeDownloadAllowed({ subject: guestSubject, releaseId, now })
      ).rejects.toBeInstanceOf(CapReachedError);

      const caught = await service
        .assertFreeDownloadAllowed({ subject: guestSubject, releaseId, now })
        .then(() => null)
        .catch((err: unknown) => err);
      expect(caught).toBeInstanceOf(CapReachedError);
      const capError = caught as CapReachedError;
      expect(capError.resetsAt).toEqual(new Date(oldest.getTime() + FREE_DOWNLOAD_WINDOW_MS));
      expect(capError.code).toBe('CAP_REACHED');
    });

    it('queries by visitorIds union when provided (identity conflict)', async () => {
      vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mockResolvedValue({
        count: 0,
        oldestInWindow: null,
      });

      await service.assertFreeDownloadAllowed({
        subject: guestSubject,
        visitorIds: ['visitor-1', 'visitor-2'],
        releaseId,
        now,
      });

      const call = vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mock.calls[0]?.[0];
      expect(call).toEqual({
        visitorIds: ['visitor-1', 'visitor-2'],
        releaseId,
        windowStart: new Date(now.getTime() - FREE_DOWNLOAD_WINDOW_MS),
      });
    });

    it('queries by userId for authenticated subjects, skipping identity resolution', async () => {
      vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mockResolvedValue({
        count: 0,
        oldestInWindow: null,
      });

      await service.assertFreeDownloadAllowed({
        subject: userSubject,
        releaseId,
        now,
      });

      const call = vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mock.calls[0]?.[0];
      expect(call).toEqual({
        userId: 'user-1',
        releaseId,
        windowStart: new Date(now.getTime() - FREE_DOWNLOAD_WINDOW_MS),
      });
    });
  });

  describe('recordSuccessfulDownload', () => {
    it('writes a single DownloadEvent row keyed by visitorId for guests', async () => {
      await service.recordSuccessfulDownload({
        subject: { kind: 'guest', visitorId: 'visitor-1' },
        releaseId,
        formatType: 'MP3_320KBPS',
        ipAddress: '203.0.113.1',
        userAgent: 'UA',
      });

      expect(eventRepo.logDownloadEvent).toHaveBeenCalledTimes(1);
      expect(eventRepo.logDownloadEvent).toHaveBeenCalledWith({
        userId: null,
        visitorId: 'visitor-1',
        releaseId,
        formatType: 'MP3_320KBPS',
        success: true,
        ipAddress: '203.0.113.1',
        userAgent: 'UA',
      });
    });

    it('writes a single DownloadEvent row keyed by userId for authenticated users', async () => {
      await service.recordSuccessfulDownload({
        subject: { kind: 'user', userId: 'user-1' },
        releaseId,
        formatType: 'AAC',
      });

      expect(eventRepo.logDownloadEvent).toHaveBeenCalledWith({
        userId: 'user-1',
        visitorId: null,
        releaseId,
        formatType: 'AAC',
        success: true,
        ipAddress: '',
        userAgent: '',
      });
    });
  });

  describe('default-argument fallbacks', () => {
    it('uses crypto.randomUUID() when no mintVisitorId override is supplied', async () => {
      const defaultService = new FreeDownloadQuotaService(visitorRepo, eventRepo);
      const result = await defaultService.resolveVisitorIdentity({
        cookieValue: null,
        fingerprintHash,
        now,
      });

      expect(result.primaryVisitorId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(result.cookieReissue).toBe(true);
    });

    it('falls back to a fresh Date() when input.now is omitted in resolveVisitorIdentity', async () => {
      const before = Date.now();
      await service.resolveVisitorIdentity({
        cookieValue: null,
        fingerprintHash,
      });
      const after = Date.now();

      expect(visitorRepo.upsert).toHaveBeenCalledTimes(1);
      const passedNow = vi.mocked(visitorRepo.upsert).mock.calls[0][1];
      expect(passedNow).toBeInstanceOf(Date);
      expect((passedNow as Date).getTime()).toBeGreaterThanOrEqual(before);
      expect((passedNow as Date).getTime()).toBeLessThanOrEqual(after);
    });

    it('falls back to a fresh Date() when params.now is omitted in assertFreeDownloadAllowed', async () => {
      const result = await service.assertFreeDownloadAllowed({
        subject: { kind: 'guest', visitorId: 'v1' },
        releaseId,
      });

      expect(result.allowed).toBe(true);
      expect(eventRepo.countSuccessfulDownloadsInWindow).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mock.calls[0][0];
      expect(arg.windowStart).toBeInstanceOf(Date);
    });

    it('uses a now-based reset when CapReached fires without an oldestInWindow', async () => {
      vi.mocked(eventRepo.countSuccessfulDownloadsInWindow).mockResolvedValue({
        count: FREE_DOWNLOAD_CAP,
        oldestInWindow: null,
      });

      const fixedNow = new Date('2026-05-08T12:00:00Z');
      await expect(
        service.assertFreeDownloadAllowed({
          subject: { kind: 'guest', visitorId: 'v1' },
          releaseId,
          now: fixedNow,
        })
      ).rejects.toMatchObject({
        resetsAt: new Date(fixedNow.getTime() + FREE_DOWNLOAD_WINDOW_MS),
      });
    });
  });
});
