// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('../../../../../auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findAllByUser: vi.fn(),
  },
}));

describe('GET /api/user/collection', () => {
  it('should return 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/user/collection');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const request = new NextRequest('http://localhost:3000/api/user/collection');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return purchases for authenticated user', async () => {
    const mockPurchases = [
      { id: 'purchase-1', releaseId: 'release-1' },
      { id: 'purchase-2', releaseId: 'release-2' },
    ];
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    vi.mocked(PurchaseRepository.findAllByUser).mockResolvedValue(mockPurchases as never);

    const request = new NextRequest('http://localhost:3000/api/user/collection');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      purchases: mockPurchases,
      count: 2,
      isAdmin: false,
    });
    expect(PurchaseRepository.findAllByUser).toHaveBeenCalledWith('user-1');
  });

  it('should return isAdmin=true for admin users', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    vi.mocked(PurchaseRepository.findAllByUser).mockResolvedValue([] as never);

    const request = new NextRequest('http://localhost:3000/api/user/collection');
    const response = await GET(request);
    const data = await response.json();

    expect(data.isAdmin).toBe(true);
  });

  it('should return empty array when no purchases', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    vi.mocked(PurchaseRepository.findAllByUser).mockResolvedValue([] as never);

    const request = new NextRequest('http://localhost:3000/api/user/collection');
    const response = await GET(request);
    const data = await response.json();

    expect(data).toEqual({ purchases: [], count: 0, isAdmin: false });
  });

  it('should return 500 when an exception is thrown', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    vi.mocked(PurchaseRepository.findAllByUser).mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost:3000/api/user/collection');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
