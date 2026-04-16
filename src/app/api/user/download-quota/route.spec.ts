/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GET } from './route';

const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
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

describe('GET /api/user/download-quota', () => {
  beforeEach(() => {
    mockGetToken.mockResolvedValue({ sub: 'user-123' });
    mockGetQuotaStatus.mockResolvedValue({
      remainingDownloads: 3,
      uniqueReleaseIds: ['release-1', 'release-2'],
      isQuotaExceeded: false,
    });
  });

  it('should return 401 when user is not authenticated', async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 401 when token has no sub', async () => {
    mockGetToken.mockResolvedValue({ sub: undefined });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return quota status for authenticated user', async () => {
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.remainingDownloads).toBe(3);
    expect(body.isQuotaExceeded).toBe(false);
  });

  it('should call quota service with user ID from token', async () => {
    await GET(makeRequest());

    expect(mockGetQuotaStatus).toHaveBeenCalledWith('user-123');
  });

  it('should return 500 on unexpected error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetQuotaStatus.mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });
});
