/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  extractClientIp: () => '127.0.0.1',
}));
const mockDownloadLimiterCheck = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: (...args: unknown[]) => mockDownloadLimiterCheck(...args) },
  DOWNLOAD_LIMIT: 10,
}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockCheckFormatExists = vi.fn();
const mockCheckPurchaseStatus = vi.fn();
const mockCheckSoftDeleteGracePeriod = vi.fn();
const mockGenerateDownloadUrl = vi.fn();
vi.mock('@/lib/services/download-authorization-service', () => {
  return {
    DownloadAuthorizationService: class MockAuthService {
      checkFormatExists = mockCheckFormatExists;
      checkPurchaseStatus = mockCheckPurchaseStatus;
      checkSoftDeleteGracePeriod = mockCheckSoftDeleteGracePeriod;
      generateDownloadUrl = mockGenerateDownloadUrl;
    },
  };
});

const mockLogDownloadEvent = vi.fn();
vi.mock('@/lib/repositories/download-event-repository', () => {
  return {
    DownloadEventRepository: class MockEventRepo {
      logDownloadEvent = mockLogDownloadEvent;
    },
  };
});

const mockCheckFreeDownloadQuota = vi.fn();
const mockIncrementQuota = vi.fn();
vi.mock('@/lib/services/quota-enforcement-service', () => {
  return {
    QuotaEnforcementService: class MockQuotaService {
      checkFreeDownloadQuota = mockCheckFreeDownloadQuota;
      incrementQuota = mockIncrementQuota;
    },
  };
});

const makeRequest = (): NextRequest =>
  new NextRequest(
    'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/MP3_320KBPS',
    {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
    }
  );

const makeParams = (id = '507f1f77bcf86cd799439011', formatType = 'MP3_320KBPS') => ({
  params: Promise.resolve({ id, formatType }),
});

const mockFormat = {
  id: 'format-1',
  releaseId: '507f1f77bcf86cd799439011',
  formatType: 'MP3_320KBPS',
  s3Key: 'releases/507f1f77bcf86cd799439011/digital-formats/MP3_320KBPS/file.mp3',
  fileName: 'album.mp3',
  fileSize: BigInt(50000000),
  mimeType: 'audio/mpeg',
  deletedAt: null,
};

describe('GET /api/releases/[id]/download/[formatType]', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123', role: 'user' } });
    mockCheckFormatExists.mockResolvedValue(mockFormat);
    mockCheckPurchaseStatus.mockResolvedValue(true);
    mockGenerateDownloadUrl.mockResolvedValue('https://s3.example.com/download?signed=true');
    mockLogDownloadEvent.mockResolvedValue(undefined);
  });

  it('should return 401 when user is not authenticated (withAuth)', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });

  it('should return 401 when session has no user id (withAuth)', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(401);
  });

  it('skips rate limiting in E2E test mode (E2E_MODE=true)', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const response = await GET(makeRequest(), makeParams());

    // The limiter is never consulted in E2E mode, so retried downloads can't 429.
    expect(mockDownloadLimiterCheck).not.toHaveBeenCalled();
    expect(response.status).not.toBe(429);

    vi.unstubAllEnvs();
  });

  it('should return 400 for an invalid release ID', async () => {
    const response = await GET(makeRequest(), makeParams('not-an-object-id'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_ID');
    expect(mockCheckFormatExists).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid format type', async () => {
    const response = await GET(
      makeRequest(),
      makeParams('507f1f77bcf86cd799439011', 'INVALID_FORMAT')
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMAT');
  });

  it('should return 404 when format does not exist', async () => {
    mockCheckFormatExists.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('should return 403 when quota exceeded for non-purchaser', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: false, reason: 'QUOTA_EXCEEDED' });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('QUOTA_EXCEEDED');
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'QUOTA_EXCEEDED' })
    );
  });

  it('should increment quota for non-purchaser within quota', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'WITHIN_QUOTA' });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockIncrementQuota).toHaveBeenCalledWith(
      { kind: 'user', userId: 'user-123' },
      '507f1f77bcf86cd799439011'
    );
  });

  it('should not increment quota when already downloaded', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'ALREADY_DOWNLOADED' });

    await GET(makeRequest(), makeParams());

    expect(mockIncrementQuota).not.toHaveBeenCalled();
  });

  // #666 — a non-purchaser may only pull free formats (MP3_320KBPS / AAC) via
  // the freemium path. Lossless masters (FLAC/WAV/AIFF/ALAC) require a purchase.
  it('should return 403 PURCHASE_REQUIRED when a non-purchaser requests a lossless format', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);

    const response = await GET(makeRequest(), makeParams('507f1f77bcf86cd799439011', 'FLAC'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('PURCHASE_REQUIRED');
  });

  it('does not consult the freemium quota for a lossless non-purchaser request', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);

    await GET(makeRequest(), makeParams('507f1f77bcf86cd799439011', 'WAV'));

    expect(mockCheckFreeDownloadQuota).not.toHaveBeenCalled();
    expect(mockIncrementQuota).not.toHaveBeenCalled();
  });

  it('logs a failed download event for a lossless non-purchaser request', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);

    await GET(makeRequest(), makeParams('507f1f77bcf86cd799439011', 'ALAC'));

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'PURCHASE_REQUIRED' })
    );
  });

  it('allows a non-purchaser to download a free lossy format (AAC)', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'WITHIN_QUOTA' });

    const response = await GET(makeRequest(), makeParams('507f1f77bcf86cd799439011', 'AAC'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('allows a purchaser to download a lossless format', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(true);

    const response = await GET(makeRequest(), makeParams('507f1f77bcf86cd799439011', 'FLAC'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should return 410 for deleted format outside grace period for non-purchaser', async () => {
    const deletedFormat = { ...mockFormat, deletedAt: new Date() };
    mockCheckFormatExists.mockResolvedValue(deletedFormat);
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'WITHIN_QUOTA' });
    mockCheckSoftDeleteGracePeriod.mockResolvedValue(false);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toBe('DELETED');
  });

  it('should allow downloaded of deleted format within grace period', async () => {
    const deletedFormat = { ...mockFormat, deletedAt: new Date() };
    mockCheckFormatExists.mockResolvedValue(deletedFormat);
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'WITHIN_QUOTA' });
    mockCheckSoftDeleteGracePeriod.mockResolvedValue(true);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should allow purchaser to download deleted format beyond grace period', async () => {
    const deletedFormat = { ...mockFormat, deletedAt: new Date() };
    mockCheckFormatExists.mockResolvedValue(deletedFormat);
    mockCheckPurchaseStatus.mockResolvedValue(true);
    mockCheckSoftDeleteGracePeriod.mockResolvedValue(false);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should return success with downloadUrl for purchaser', async () => {
    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.downloadUrl).toBe('https://s3.example.com/download?signed=true');
    expect(body.fileName).toBe('album.mp3');
    expect(body.expiresAt).toBeDefined();
  });

  it('should log successful download event', async () => {
    await GET(makeRequest(), makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        userId: 'user-123',
        releaseId: '507f1f77bcf86cd799439011',
      })
    );
  });

  it('should return 500 when format has no s3Key', async () => {
    const incompleteFormat = { ...mockFormat, s3Key: null };
    mockCheckFormatExists.mockResolvedValue(incompleteFormat);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Format file data is incomplete.');
  });

  it('should return 500 when format has no fileName', async () => {
    const incompleteFormat = { ...mockFormat, fileName: null };
    mockCheckFormatExists.mockResolvedValue(incompleteFormat);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Format file data is incomplete.');
  });

  it('should use fallback values when headers are missing', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/MP3_320KBPS'
    );

    await GET(req, makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: 'unknown',
        userAgent: 'unknown',
      })
    );
  });

  it('should use fallback header values in quota exceeded log event', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/MP3_320KBPS'
    );
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: false, reason: 'QUOTA_EXCEEDED' });

    await GET(req, makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: 'unknown',
        userAgent: 'unknown',
        errorCode: 'QUOTA_EXCEEDED',
      })
    );
  });

  it('should use fallback header values in deleted format log event', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/MP3_320KBPS'
    );
    const deletedFormat = { ...mockFormat, deletedAt: new Date() };
    mockCheckFormatExists.mockResolvedValue(deletedFormat);
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'WITHIN_QUOTA' });
    mockCheckSoftDeleteGracePeriod.mockResolvedValue(false);

    await GET(req, makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: 'unknown',
        userAgent: 'unknown',
        errorCode: 'DELETED',
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckFormatExists.mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });
});
