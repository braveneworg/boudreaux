/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { GET } from './route';

const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
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

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/releases/release-1/download/MP3_320KBPS', {
    headers: {
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'test-agent',
    },
  });
}

function makeParams(id = 'release-1', formatType = 'MP3_320KBPS') {
  return { params: Promise.resolve({ id, formatType }) };
}

const mockFormat = {
  id: 'format-1',
  releaseId: 'release-1',
  formatType: 'MP3_320KBPS',
  s3Key: 'releases/release-1/digital-formats/MP3_320KBPS/file.mp3',
  fileName: 'album.mp3',
  fileSize: BigInt(50000000),
  mimeType: 'audio/mpeg',
  deletedAt: null,
};

describe('GET /api/releases/[id]/download/[formatType]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue({ sub: 'user-123' });
    mockCheckFormatExists.mockResolvedValue(mockFormat);
    mockCheckPurchaseStatus.mockResolvedValue(true);
    mockGenerateDownloadUrl.mockResolvedValue('https://s3.example.com/download?signed=true');
    mockLogDownloadEvent.mockResolvedValue(undefined);
  });

  it('should return 401 when user is not authenticated', async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 401 when token has no sub', async () => {
    mockGetToken.mockResolvedValue({ sub: undefined });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 400 for invalid format type', async () => {
    const response = await GET(makeRequest(), makeParams('release-1', 'INVALID_FORMAT'));
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
    expect(mockIncrementQuota).toHaveBeenCalledWith('user-123', 'release-1');
  });

  it('should not increment quota when already downloaded', async () => {
    mockCheckPurchaseStatus.mockResolvedValue(false);
    mockCheckFreeDownloadQuota.mockResolvedValue({ allowed: true, reason: 'ALREADY_DOWNLOADED' });

    await GET(makeRequest(), makeParams());

    expect(mockIncrementQuota).not.toHaveBeenCalled();
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
      expect.objectContaining({ success: true, userId: 'user-123', releaseId: 'release-1' })
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
      'http://localhost:3000/api/releases/release-1/download/MP3_320KBPS'
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
      'http://localhost:3000/api/releases/release-1/download/MP3_320KBPS'
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
      'http://localhost:3000/api/releases/release-1/download/MP3_320KBPS'
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
