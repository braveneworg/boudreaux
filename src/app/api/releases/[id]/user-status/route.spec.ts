// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByUserAndRelease: vi.fn(),
  },
}));

const mockGetDownloadAccess = vi.fn();
vi.mock('@/lib/services/purchase-service', () => ({
  PurchaseService: {
    getDownloadAccessForPurchase: (...args: unknown[]) => mockGetDownloadAccess(...args),
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
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 0,
      lastDownloadedAt: null,
      resetInHours: null,
    });
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

  it('should return user status with purchase info and resetInHours', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue({
      purchasedAt: new Date('2024-06-01'),
    } as never);
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'download_limit_reached',
      downloadCount: 5,
      lastDownloadedAt: new Date('2024-06-01T10:00:00.000Z'),
      resetInHours: 4,
    });

    mockFindAllByRelease.mockResolvedValue([
      { formatType: 'MP3_320KBPS', fileName: 'album.zip', files: [] },
    ]);

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      hasPurchase: true,
      purchasedAt: new Date('2024-06-01'),
      downloadCount: 5,
      resetInHours: 4,
      availableFormats: [{ formatType: 'MP3_320KBPS', fileName: 'album.zip' }],
    });
    expect(mockGetDownloadAccess).toHaveBeenCalledWith(
      expect.objectContaining({ purchasedAt: new Date('2024-06-01') }),
      'user-1',
      'release-1'
    );
  });

  it('should map availableFormats fileName from fileName, files[0], and fallback format zip', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue(null as never);

    mockFindAllByRelease.mockResolvedValue([
      { formatType: 'FLAC', fileName: 'album-flac.zip', files: [] },
      { formatType: 'WAV', fileName: null, files: [{ fileName: 'wav-track.zip' }] },
      { formatType: 'AAC', fileName: null, files: [] },
    ]);

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.availableFormats).toEqual([
      { formatType: 'FLAC', fileName: 'album-flac.zip' },
      { formatType: 'WAV', fileName: 'wav-track.zip' },
      { formatType: 'AAC', fileName: 'AAC.zip' },
    ]);
  });

  it('should return default values when no purchase exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    vi.mocked(PurchaseRepository.findByUserAndRelease).mockResolvedValue(null as never);

    mockFindAllByRelease.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/releases/release-1/user-status');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasPurchase).toBe(false);
    expect(data.purchasedAt).toBeNull();
    expect(data.downloadCount).toBe(0);
    expect(data.resetInHours).toBeNull();
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
