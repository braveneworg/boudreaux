/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { POST } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: vi.fn().mockResolvedValue(undefined) },
  DOWNLOAD_LIMIT: 10,
}));

const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

const mockGetDownloadAccess = vi.fn();
vi.mock('@/lib/services/purchase-service', () => ({
  PurchaseService: {
    getDownloadAccess: (...args: unknown[]) => mockGetDownloadAccess(...args),
  },
}));

const mockUpsertDownloadCount = vi.fn();
vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    upsertDownloadCount: (...args: unknown[]) => mockUpsertDownloadCount(...args),
  },
}));

const mockLogDownloadEvent = vi.fn();
vi.mock('@/lib/repositories/download-event-repository', () => ({
  DownloadEventRepository: class MockRepo {
    logDownloadEvent = mockLogDownloadEvent;
  },
}));

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/confirm',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify(body),
    }
  );
}

function makeParams(id = '507f1f77bcf86cd799439011') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/releases/[id]/download/confirm', () => {
  beforeEach(() => {
    mockGetToken.mockResolvedValue({ sub: 'user-123' });
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 1,
      lastDownloadedAt: null,
    });
    mockUpsertDownloadCount.mockResolvedValue(undefined);
    mockLogDownloadEvent.mockResolvedValue(undefined);
  });

  it('should return 401 when user is not authenticated', async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await POST(makeRequest({ formats: ['FLAC'] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 400 for invalid release ID', async () => {
    const response = await POST(makeRequest({ formats: ['FLAC'] }), makeParams('invalid'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_ID');
  });

  it('should return 400 for invalid JSON body', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/confirm',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '127.0.0.1',
          'user-agent': 'test-agent',
        },
        body: 'not-json',
      }
    );

    const response = await POST(req, makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_BODY');
  });

  it('should return 400 when formats array is empty', async () => {
    const response = await POST(makeRequest({ formats: [] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
  });

  it('should return 400 when formats is not an array', async () => {
    const response = await POST(makeRequest({ formats: 'FLAC' }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
  });

  it('should return 400 when no valid format types provided', async () => {
    const response = await POST(makeRequest({ formats: ['INVALID_FORMAT'] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
  });

  it('should return 403 when no purchase exists', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'no_purchase',
      downloadCount: 0,
      lastDownloadedAt: null,
    });

    const response = await POST(makeRequest({ formats: ['FLAC'] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('PURCHASE_REQUIRED');
  });

  it('should return 403 when download limit is reached', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'download_limit_reached',
      downloadCount: 5,
      lastDownloadedAt: null,
    });

    const response = await POST(makeRequest({ formats: ['FLAC'] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('DOWNLOAD_LIMIT');
  });

  it('should increment download count once on success', async () => {
    const response = await POST(makeRequest({ formats: ['FLAC', 'WAV'] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpsertDownloadCount).toHaveBeenCalledTimes(1);
    expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', '507f1f77bcf86cd799439011');
  });

  it('should log download events per format', async () => {
    await POST(makeRequest({ formats: ['FLAC', 'WAV'] }), makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(2);
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        releaseId: '507f1f77bcf86cd799439011',
        formatType: 'FLAC',
        success: true,
      })
    );
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        releaseId: '507f1f77bcf86cd799439011',
        formatType: 'WAV',
        success: true,
      })
    );
  });

  it('should filter invalid format types and de-duplicate valid formats from body', async () => {
    await POST(makeRequest({ formats: ['FLAC', 'INVALID', 'WAV', 'FLAC'] }), makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(2);
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ formatType: 'FLAC' })
    );
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ formatType: 'WAV' })
    );
  });

  it('should return 500 on unexpected error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDownloadAccess.mockRejectedValue(new Error('DB error'));

    const response = await POST(makeRequest({ formats: ['FLAC'] }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  it('should include ip and user-agent in download events', async () => {
    await POST(makeRequest({ formats: ['FLAC'] }), makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      })
    );
  });

  it('should use fallback user-agent when header is missing', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formats: ['FLAC'] }),
      }
    );

    await POST(req, makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '127.0.0.1',
        userAgent: 'unknown',
      })
    );
  });
});
