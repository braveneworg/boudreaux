/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { GET } from './route';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockGetQuotaStatus = vi.fn();
vi.mock('@/lib/services/quota-enforcement-service', () => {
  return {
    QuotaEnforcementService: class MockQuotaService {
      getQuotaStatus = mockGetQuotaStatus;
    },
  };
});

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/user/download-quota');
}

const ctx = { params: Promise.resolve({}) };

describe('GET /api/user/download-quota', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123', role: 'user' } });
    mockGetQuotaStatus.mockResolvedValue({
      remainingDownloads: 3,
      uniqueReleaseIds: ['release-1', 'release-2'],
      isQuotaExceeded: false,
    });
  });

  it('should return 401 when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(makeRequest(), ctx);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });

  it('should return 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const response = await GET(makeRequest(), ctx);

    expect(response.status).toBe(401);
  });

  it('should return quota status for authenticated user', async () => {
    const response = await GET(makeRequest(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.remainingDownloads).toBe(3);
    expect(body.isQuotaExceeded).toBe(false);
  });

  it('should call quota service with user ID from session', async () => {
    await GET(makeRequest(), ctx);

    expect(mockGetQuotaStatus).toHaveBeenCalledWith({ kind: 'user', userId: 'user-123' });
  });

  it('should return 500 on unexpected error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetQuotaStatus.mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest(), ctx);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });
});
