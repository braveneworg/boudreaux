// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('../../../../../../auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByUserAndRelease: vi.fn(),
    getDownloadRecord: vi.fn(),
  },
}));

const mockFindAllByRelease = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class {
    findAllByRelease = (...args: unknown[]) => mockFindAllByRelease(...args);
  },
}));

describe('GET /api/releases/[id]/user-status', () => {
  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    mockFindAllByRelease.mockResolvedValue([]);
  });

  it('should return 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));

    expect(response.status).toBe(401);
  });

  it('should return user status with purchase info', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue({
      purchasedAt: new Date('2024-06-01'),
    } as never);
    vi.mocked(PurchaseRepository.getDownloadRecord).mockResolvedValue({
      downloadCount: 3,
    } as never);

    const mockFormats = [{ formatType: 'MP3_320KBPS', fileName: 'album.zip', files: [] }];
    mockFindAllByRelease.mockResolvedValue(mockFormats);

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasPurchase).toBe(true);
    expect(data.downloadCount).toBe(3);
    expect(data.availableFormats).toHaveLength(1);
    expect(data.availableFormats[0].formatType).toBe('MP3_320KBPS');
  });

  it('should return default values when no purchase exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue(null as never);
    vi.mocked(PurchaseRepository.getDownloadRecord).mockResolvedValue(null as never);

    mockFindAllByRelease.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasPurchase).toBe(false);
    expect(data.purchasedAt).toBeNull();
    expect(data.downloadCount).toBe(0);
  });

  it('should return 500 when an exception is thrown', async () => {
    mockAuth.mockRejectedValue(new Error('Auth error'));

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
