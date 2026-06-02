/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const findActiveMatchMock = vi.fn();

vi.mock('@/lib/repositories/banned-identity-repository', () => ({
  BannedIdentityRepository: {
    findActiveMatch: findActiveMatchMock,
  },
}));

const { BanEvasionService } = await import('./ban-evasion-service');

describe('BanEvasionService.check', () => {
  beforeEach(() => {
    findActiveMatchMock.mockReset();
  });

  it('returns banned:true with the reason on a match', async () => {
    findActiveMatchMock.mockResolvedValue({ id: 'b1', reason: 'harassment' });
    const result = await BanEvasionService.check({
      userId: 'u1',
      email: 'a@b.c',
      userAgent: 'ua',
      acceptLanguage: 'en',
      ip: '1.2.3.4',
    });
    expect(result.banned).toBe(true);
    expect(result.reason).toBe('harassment');
  });

  it('returns banned:false when no match', async () => {
    findActiveMatchMock.mockResolvedValue(null);
    const result = await BanEvasionService.check({
      userId: 'u1',
      email: 'a@b.c',
      userAgent: 'ua',
      acceptLanguage: 'en',
      ip: '1.2.3.4',
    });
    expect(result.banned).toBe(false);
  });

  it('passes the computed fingerprint hash to the repository', async () => {
    findActiveMatchMock.mockResolvedValue(null);
    await BanEvasionService.check({
      userId: 'u1',
      email: null,
      userAgent: 'ua',
      acceptLanguage: 'en',
      ip: '1.2.3.4',
    });
    const args = findActiveMatchMock.mock.calls[0]?.[0] as {
      fingerprintHash: string;
    };
    expect(args.fingerprintHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defaults a missing userId to null for the lookup', async () => {
    findActiveMatchMock.mockResolvedValue(null);
    await BanEvasionService.check({
      email: 'a@b.c',
      userAgent: 'ua',
      acceptLanguage: 'en',
      ip: '1.2.3.4',
    });
    const args = findActiveMatchMock.mock.calls[0]?.[0] as { userId: string | null };
    expect(args.userId).toBeNull();
  });
});

describe('BanEvasionService.fingerprintFor', () => {
  it('returns a 64-char hex hash', () => {
    const hash = BanEvasionService.fingerprintFor({
      userAgent: 'Mozilla',
      acceptLanguage: 'en-US',
      ip: '203.0.113.4',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces a stable hash for the same inputs', () => {
    const a = BanEvasionService.fingerprintFor({
      userAgent: 'Mozilla',
      acceptLanguage: 'en-US',
      ip: '203.0.113.4',
    });
    const b = BanEvasionService.fingerprintFor({
      userAgent: 'Mozilla',
      acceptLanguage: 'en-US',
      ip: '203.0.113.4',
    });
    expect(a).toBe(b);
  });

  it('produces different hashes for different IP /24 prefixes', () => {
    const a = BanEvasionService.fingerprintFor({
      userAgent: 'Mozilla',
      acceptLanguage: 'en-US',
      ip: '203.0.113.4',
    });
    const b = BanEvasionService.fingerprintFor({
      userAgent: 'Mozilla',
      acceptLanguage: 'en-US',
      ip: '203.0.114.4',
    });
    expect(a).not.toBe(b);
  });
});
