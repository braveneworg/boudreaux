/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VisitorIdentityRepository } from '@/lib/repositories/visitor-identity-repository';
import type { VisitorIdentityRecord } from '@/lib/types/domain/visitor-identity';

import { GuestIdentityService } from './guest-identity-service';

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

describe('GuestIdentityService', () => {
  const now = new Date('2026-05-08T12:00:00Z');
  const fingerprintHash = 'a'.repeat(64);

  let visitorRepo: VisitorIdentityRepository;
  let mintVisitorId: ReturnType<typeof vi.fn> & (() => string);
  let service: GuestIdentityService;

  beforeEach(() => {
    visitorRepo = new VisitorIdentityRepository();
    mintVisitorId = vi.fn(() => 'minted-uuid');
    vi.spyOn(visitorRepo, 'findByVisitorId').mockResolvedValue(null);
    vi.spyOn(visitorRepo, 'findByFingerprintHash').mockResolvedValue(null);
    vi.spyOn(visitorRepo, 'upsert').mockImplementation(async ({ visitorId }) =>
      makeRow({ visitorId, fingerprintHash })
    );

    service = new GuestIdentityService(visitorRepo, mintVisitorId);
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

  describe('default-argument fallbacks', () => {
    it('uses crypto.randomUUID() when no mintVisitorId override is supplied', async () => {
      const defaultService = new GuestIdentityService(visitorRepo);
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
  });
});
