/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { checkGuestPurchaseAction } from './check-guest-purchase-action';

vi.mock('server-only', () => ({}));

const mockFindUserByEmail = vi.fn();
const mockCheckExistingPurchase = vi.fn();
const mockStatus = vi.fn();
const mockHeaders = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  },
}));

vi.mock('@/lib/services/purchase-service', () => ({
  PurchaseService: {
    checkExistingPurchase: (...args: unknown[]) => mockCheckExistingPurchase(...args),
  },
}));
vi.mock('@/lib/services/download-gate/download-gate', () => ({
  downloadGate: { status: (...args: unknown[]) => mockStatus(...args) },
}));

describe('checkGuestPurchaseAction', () => {
  beforeEach(() => {
    mockHeaders.mockReturnValue({
      get: (name: string) => (name === 'x-forwarded-for' ? '127.0.0.1' : null),
    });
  });

  it('should return no-purchase status when user is not found', async () => {
    mockFindUserByEmail.mockResolvedValue(null);

    const result = await checkGuestPurchaseAction('unknown@example.com', 'release-1');

    expect(result).toEqual({
      hasPurchase: false,
      downloadCount: 0,
      atCap: false,
      resetInHours: null,
    });
    expect(mockFindUserByEmail).toHaveBeenCalledWith('unknown@example.com');
    expect(mockCheckExistingPurchase).not.toHaveBeenCalled();
  });

  it('should not include userId in the response', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'user-123' });
    mockCheckExistingPurchase.mockResolvedValue(false);

    const result = await checkGuestPurchaseAction('guest@example.com', 'release-1');

    expect(result).not.toHaveProperty('userId');
  });

  it('should return no-purchase status when user exists but has no purchase', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'user-123' });
    mockCheckExistingPurchase.mockResolvedValue(false);

    const result = await checkGuestPurchaseAction('guest@example.com', 'release-1');

    expect(result).toEqual({
      hasPurchase: false,
      downloadCount: 0,
      atCap: false,
      resetInHours: null,
    });
    expect(mockCheckExistingPurchase).toHaveBeenCalledWith('user-123', 'release-1');
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('should return purchase status with download count when user has a purchase', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'user-456' });
    mockCheckExistingPurchase.mockResolvedValue(true);
    mockStatus.mockResolvedValue({ purchaseThrottle: { count: 2, resetInHours: null } });

    const result = await checkGuestPurchaseAction('buyer@example.com', 'release-2');

    expect(result).toEqual({
      hasPurchase: true,
      downloadCount: 2,
      atCap: false,
      resetInHours: null,
    });
    expect(mockStatus.mock.calls).toEqual([[{ kind: 'user', userId: 'user-456' }, 'release-2']]);
  });

  it('should return atCap=true when download count reaches the maximum', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'user-789' });
    mockCheckExistingPurchase.mockResolvedValue(true);
    mockStatus.mockResolvedValue({ purchaseThrottle: { count: 5, resetInHours: 4 } });

    const result = await checkGuestPurchaseAction('capped@example.com', 'release-3');

    expect(result).toEqual({
      hasPurchase: true,
      downloadCount: 5,
      atCap: true,
      resetInHours: 4,
    });
  });

  it('is not at cap once the idle window has passed, whatever the count says', async () => {
    mockFindUserByEmail.mockResolvedValue({ id: 'user-over' });
    mockCheckExistingPurchase.mockResolvedValue(true);
    mockStatus.mockResolvedValue({ purchaseThrottle: { count: 7, resetInHours: null } });

    const result = await checkGuestPurchaseAction('over@example.com', 'release-4');

    expect(result).toEqual({
      hasPurchase: true,
      downloadCount: 7,
      atCap: false,
      resetInHours: null,
    });
  });

  it('should return no-purchase status when rate limit is exceeded', async () => {
    // Simulate rate limit exceeded by exhausting the limiter for this IP
    mockHeaders.mockReturnValue({
      get: (name: string) => (name === 'x-forwarded-for' ? '10.0.0.99' : null),
    });
    mockFindUserByEmail.mockResolvedValue({ id: 'user-123' });
    mockCheckExistingPurchase.mockResolvedValue(false);

    // Make 10 requests to exhaust the limit
    for (let i = 0; i < 10; i++) {
      await checkGuestPurchaseAction(`user${i}@example.com`, 'release-1');
    }

    // 11th request should be rate-limited and return no-purchase without querying DB
    const callsBefore = mockFindUserByEmail.mock.calls.length;
    const result = await checkGuestPurchaseAction('attacker@example.com', 'release-1');

    expect(result).toEqual({
      hasPurchase: false,
      downloadCount: 0,
      atCap: false,
      resetInHours: null,
    });
    // DB should not be queried after rate limit is hit
    expect(mockFindUserByEmail.mock.calls.length).toBe(callsBefore);
  });

  it('should fall back to x-real-ip when x-forwarded-for is not set', async () => {
    mockHeaders.mockReturnValue({
      get: (name: string) => (name === 'x-real-ip' ? '192.168.1.5' : null),
    });
    mockFindUserByEmail.mockResolvedValue(null);

    const result = await checkGuestPurchaseAction('test@example.com', 'release-1');

    expect(result).toEqual({
      hasPurchase: false,
      downloadCount: 0,
      atCap: false,
      resetInHours: null,
    });
  });

  it('should fall back to "anonymous" when neither IP header is set', async () => {
    mockHeaders.mockReturnValue({
      get: () => null,
    });
    mockFindUserByEmail.mockResolvedValue(null);

    const result = await checkGuestPurchaseAction('anon@example.com', 'release-1');

    expect(result).toEqual({
      hasPurchase: false,
      downloadCount: 0,
      atCap: false,
      resetInHours: null,
    });
  });
});
