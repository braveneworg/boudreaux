/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockGetToken = vi.fn();

vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

const mockReleaseFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    release: {
      findFirst: (...args: unknown[]) => mockReleaseFindFirst(...args),
    },
  },
}));

const mockGetDownloadAccess = vi.fn();
const mockIncrementDownloadCount = vi.fn();

vi.mock('@/lib/services/purchase-service', () => ({
  PurchaseService: {
    getDownloadAccess: (...args: unknown[]) => mockGetDownloadAccess(...args),
    incrementDownloadCount: (...args: unknown[]) => mockIncrementDownloadCount(...args),
  },
}));

vi.mock('@/lib/constants', () => ({
  MAX_RELEASE_DOWNLOAD_COUNT: 5,
}));

const makeRequest = () => new NextRequest('http://localhost/api/releases/release-123/download');

const makeParams = () => ({
  params: Promise.resolve({ id: 'release-123' }),
});

describe('GET /api/releases/[id]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncrementDownloadCount.mockResolvedValue(undefined);
  });

  it('redirects to /signin with callbackUrl when no auth token is present', async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(302);
    const location = response.headers.get('Location');
    expect(location?.toString()).toContain('/signin');
    expect(location?.toString()).toContain('callbackUrl');
    expect(location?.toString()).toContain('release-123');
  });

  it('returns 404 with release_not_found when the release does not exist', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    mockReleaseFindFirst.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: 'release_not_found' });
  });

  it('returns 404 with no_download_url when release has an empty downloadUrls array', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    mockReleaseFindFirst.mockResolvedValue({ id: 'release-123', downloadUrls: [] });

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: 'no_download_url' });
  });

  it('returns 403 with no_purchase when getDownloadAccess denies with no_purchase', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    mockReleaseFindFirst.mockResolvedValue({
      id: 'release-123',
      downloadUrls: ['https://cdn.example.com/release.zip'],
    });
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'no_purchase',
      downloadCount: 0,
    });

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('no_purchase');
    expect(mockIncrementDownloadCount).not.toHaveBeenCalled();
  });

  it('returns 403 with download_limit_reached and counts when download cap is exceeded', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    mockReleaseFindFirst.mockResolvedValue({
      id: 'release-123',
      downloadUrls: ['https://cdn.example.com/release.zip'],
    });
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'download_limit_reached',
      downloadCount: 5,
    });

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json).toEqual({
      error: 'download_limit_reached',
      downloadCount: 5,
      maxDownloadCount: 5,
    });
    expect(mockIncrementDownloadCount).not.toHaveBeenCalled();
  });

  it('increments download count then redirects to downloadUrls[0] when access is allowed', async () => {
    const downloadUrl = 'https://cdn.example.com/release.zip';
    mockGetToken.mockResolvedValue({ sub: 'user-abc' });
    mockReleaseFindFirst.mockResolvedValue({
      id: 'release-123',
      downloadUrls: [downloadUrl],
    });
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 2,
    });

    const response = await GET(makeRequest(), makeParams());

    expect(mockIncrementDownloadCount).toHaveBeenCalledWith('user-abc', 'release-123');
    expect(response.status).toBe(302);
    const location = response.headers.get('Location');
    expect(location?.toString()).toBe(downloadUrl);
  });
});
