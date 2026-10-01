/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import type { DownloadSubject } from '@/types/download-subject';

import { prismaCounters } from './counters';

import type { AuditContext, CounterFacts } from './counters';
import type { Grant } from './types';

// The counters' mapping onto the four stores, with the repositories mocked.
// `counters.contract.spec.ts` proves the same seam against a real MongoDB.

vi.mock('server-only', () => ({}));

const { mockCountFree, mockLogEvent, mockFindReleaseIds, mockAddUniqueRelease } = vi.hoisted(
  () => ({
    mockCountFree: vi.fn(),
    mockLogEvent: vi.fn(),
    mockFindReleaseIds: vi.fn(),
    mockAddUniqueRelease: vi.fn(),
  })
);
vi.mock('@/lib/repositories/download-event-repository', () => ({
  DownloadEventRepository: class {
    countFreeDownloadsInWindow = mockCountFree;
    logDownloadEvent = mockLogEvent;
  },
}));
vi.mock('@/lib/repositories/user-download-quota-repository', () => ({
  UserDownloadQuotaRepository: class {
    findReleaseIds = mockFindReleaseIds;
    addUniqueRelease = mockAddUniqueRelease;
  },
}));
vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByUserAndRelease: vi.fn(),
    getDownloadRecord: vi.fn(),
    recordPurchasedDownload: vi.fn(),
  },
}));

const NOW = new Date('2026-10-01T12:00:00Z');
const RELEASE = 'release-1';
const USER = { kind: 'user', userId: 'user-1' } as const;
const GUEST: DownloadSubject = { kind: 'guest', visitorId: 'v-1', visitorIds: ['v-1', 'v-0'] };
const AUDIT: AuditContext = { ipAddress: '203.0.113.9', userAgent: 'spec' };

const facts = (overrides: Partial<CounterFacts> = {}): CounterFacts => ({
  entitled: false,
  lifetime: null,
  freeThrottle: { count: 0, oldestInWindow: null },
  purchaseThrottle: null,
  ...overrides,
});

const grant = (overrides: Partial<Grant> = {}): Grant => ({
  kind: 'grant',
  mode: 'free',
  formats: [
    { formatType: 'MP3_320KBPS', withdrawn: false },
    { formatType: 'AAC', withdrawn: false },
  ],
  charge: { lifetime: false, freeThrottle: false, purchaseThrottle: false },
  ...overrides,
});

describe('prismaCounters', () => {
  beforeEach(() => {
    mockCountFree.mockResolvedValue({ count: 0, oldestInWindow: null });
    mockLogEvent.mockResolvedValue(undefined);
    mockFindReleaseIds.mockResolvedValue([]);
    mockAddUniqueRelease.mockResolvedValue(undefined);
    vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue(null);
    vi.mocked(PurchaseRepository.getDownloadRecord).mockResolvedValue(null);
    vi.mocked(PurchaseRepository.recordPurchasedDownload).mockResolvedValue(undefined as never);
  });

  describe('read', () => {
    it('reads a guest as free tier: no entitlement, no lifetime, throttle over every visitor id', async () => {
      mockCountFree.mockResolvedValue({ count: 2, oldestInWindow: NOW });

      const result = await prismaCounters.read(GUEST, RELEASE, NOW);

      expect(result).toEqual({
        entitled: false,
        lifetime: null,
        freeThrottle: { count: 2, oldestInWindow: NOW },
        purchaseThrottle: null,
      });
      expect(mockCountFree.mock.calls[0]?.[0]).toEqual({
        releaseId: RELEASE,
        windowStart: new Date('2026-09-30T12:00:00Z'),
        visitorIds: ['v-1', 'v-0'],
      });
      expect(PurchaseRepository.findByUserAndRelease).not.toHaveBeenCalled();
    });

    it('reads an unentitled user with their lifetime slots and no purchase throttle', async () => {
      mockFindReleaseIds.mockResolvedValue(['release-9', RELEASE]);

      const result = await prismaCounters.read(USER, RELEASE, NOW);

      expect(result).toEqual({
        entitled: false,
        lifetime: { distinctReleases: 2, includesThisRelease: true },
        freeThrottle: { count: 0, oldestInWindow: null },
        purchaseThrottle: null,
      });
      expect(mockCountFree.mock.calls[0]?.[0]).toMatchObject({ userId: 'user-1' });
      expect(PurchaseRepository.getDownloadRecord).not.toHaveBeenCalled();
    });

    it('reads an entitled user with their purchase throttle record', async () => {
      vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue({
        id: 'purchase-1',
      } as never);
      vi.mocked(PurchaseRepository.getDownloadRecord).mockResolvedValue({
        downloadCount: 3,
        lastDownloadedAt: NOW,
      } as never);

      const result = await prismaCounters.read(USER, RELEASE, NOW);

      expect(result).toMatchObject({
        entitled: true,
        lifetime: { distinctReleases: 0, includesThisRelease: false },
        purchaseThrottle: { count: 3, lastDownloadedAt: NOW },
      });
    });

    it('reads an entitled user who never downloaded as count 0 with no last download', async () => {
      vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue({
        id: 'purchase-1',
      } as never);

      const result = await prismaCounters.read(USER, RELEASE, NOW);

      expect(result.purchaseThrottle).toEqual({ count: 0, lastDownloadedAt: null });
    });
  });

  describe('commit', () => {
    it('charges nothing when the grant charges nothing', async () => {
      await prismaCounters.commit({
        subject: USER,
        releaseId: RELEASE,
        grant: grant(),
        facts: facts(),
        now: NOW,
        audit: AUDIT,
      });

      expect(mockAddUniqueRelease).not.toHaveBeenCalled();
      expect(mockLogEvent).not.toHaveBeenCalled();
      expect(PurchaseRepository.recordPurchasedDownload).not.toHaveBeenCalled();
    });

    it('charges a free user download: one lifetime slot and one free-mode row named by the first format', async () => {
      await prismaCounters.commit({
        subject: USER,
        releaseId: RELEASE,
        grant: grant({ charge: { lifetime: true, freeThrottle: true, purchaseThrottle: false } }),
        facts: facts(),
        now: NOW,
        audit: AUDIT,
      });

      expect(mockAddUniqueRelease.mock.calls).toEqual([[USER, RELEASE]]);
      expect(mockLogEvent.mock.calls).toEqual([
        [
          {
            userId: 'user-1',
            visitorId: null,
            releaseId: RELEASE,
            formatType: 'MP3_320KBPS',
            success: true,
            mode: 'free',
            ...AUDIT,
          },
        ],
      ]);
    });

    it('charges a free guest download without a lifetime slot, audited under the visitor id', async () => {
      await prismaCounters.commit({
        subject: GUEST,
        releaseId: RELEASE,
        grant: grant({ charge: { lifetime: true, freeThrottle: true, purchaseThrottle: false } }),
        facts: facts(),
        now: NOW,
        audit: AUDIT,
      });

      expect(mockAddUniqueRelease).not.toHaveBeenCalled();
      expect(mockLogEvent.mock.calls[0]?.[0]).toMatchObject({ userId: null, visitorId: 'v-1' });
    });

    it('charges a purchased download: throttle tick plus one purchased-mode row per format', async () => {
      await prismaCounters.commit({
        subject: USER,
        releaseId: RELEASE,
        grant: grant({
          mode: 'purchased',
          charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
        }),
        facts: facts({ entitled: true, purchaseThrottle: { count: 1, lastDownloadedAt: NOW } }),
        now: NOW,
        audit: AUDIT,
      });

      expect(vi.mocked(PurchaseRepository.recordPurchasedDownload).mock.calls).toEqual([
        ['user-1', RELEASE, { restart: false, now: NOW }],
      ]);
      expect(mockLogEvent.mock.calls.map(([row]) => [row.formatType, row.mode])).toEqual([
        ['MP3_320KBPS', 'purchased'],
        ['AAC', 'purchased'],
      ]);
    });

    it('restarts the purchase throttle when the count was full and the idle window had passed', async () => {
      const idle = new Date(NOW.getTime() - 7 * 60 * 60 * 1000);

      await prismaCounters.commit({
        subject: USER,
        releaseId: RELEASE,
        grant: grant({
          mode: 'purchased',
          charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
        }),
        facts: facts({ entitled: true, purchaseThrottle: { count: 5, lastDownloadedAt: idle } }),
        now: NOW,
        audit: AUDIT,
      });

      expect(vi.mocked(PurchaseRepository.recordPurchasedDownload).mock.calls[0]?.[2]).toEqual({
        restart: true,
        now: NOW,
      });
    });

    it('does not restart a full throttle that is still inside its idle window', async () => {
      await prismaCounters.commit({
        subject: USER,
        releaseId: RELEASE,
        grant: grant({
          mode: 'purchased',
          charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
        }),
        facts: facts({ entitled: true, purchaseThrottle: { count: 5, lastDownloadedAt: NOW } }),
        now: NOW,
        audit: AUDIT,
      });

      expect(vi.mocked(PurchaseRepository.recordPurchasedDownload).mock.calls[0]?.[2]).toEqual({
        restart: false,
        now: NOW,
      });
    });

    it('does not restart when the facts carry no throttle record at all', async () => {
      await prismaCounters.commit({
        subject: USER,
        releaseId: RELEASE,
        grant: grant({
          mode: 'purchased',
          charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
        }),
        facts: facts({ entitled: true, purchaseThrottle: null }),
        now: NOW,
        audit: AUDIT,
      });

      expect(vi.mocked(PurchaseRepository.recordPurchasedDownload).mock.calls[0]?.[2]).toEqual({
        restart: false,
        now: NOW,
      });
    });

    it('never ticks the purchase throttle for a guest, whatever the grant says', async () => {
      await prismaCounters.commit({
        subject: GUEST,
        releaseId: RELEASE,
        grant: grant({
          mode: 'purchased',
          charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
        }),
        facts: facts(),
        now: NOW,
        audit: AUDIT,
      });

      expect(PurchaseRepository.recordPurchasedDownload).not.toHaveBeenCalled();
      expect(mockLogEvent).not.toHaveBeenCalled();
    });
  });

  describe('recordFailure', () => {
    it('writes one uncounted audit row named by the first format, in the decided mode', async () => {
      await prismaCounters.recordFailure({
        subject: USER,
        releaseId: RELEASE,
        formats: ['FLAC', 'WAV'],
        errorCode: 'STREAM_FAILED',
        mode: 'purchased',
        audit: AUDIT,
      });

      expect(mockLogEvent.mock.calls).toEqual([
        [
          {
            userId: 'user-1',
            visitorId: null,
            releaseId: RELEASE,
            formatType: 'FLAC',
            success: false,
            errorCode: 'STREAM_FAILED',
            mode: 'purchased',
            ...AUDIT,
          },
        ],
      ]);
    });

    it('records a guest failure under the visitor id with a null mode when none was decided', async () => {
      await prismaCounters.recordFailure({
        subject: GUEST,
        releaseId: RELEASE,
        formats: ['AAC'],
        errorCode: 'LOCK_HELD',
        mode: null,
        audit: AUDIT,
      });

      expect(mockLogEvent.mock.calls[0]?.[0]).toMatchObject({
        userId: null,
        visitorId: 'v-1',
        mode: null,
      });
    });
  });
});
