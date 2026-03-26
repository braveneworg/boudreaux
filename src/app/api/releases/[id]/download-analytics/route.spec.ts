// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: () => unknown) => handler,
}));

const { mockGetAnalyticsByRelease, mockGetUniqueUsers, mockGetTotalDownloads } = vi.hoisted(() => ({
  mockGetAnalyticsByRelease: vi.fn(),
  mockGetUniqueUsers: vi.fn(),
  mockGetTotalDownloads: vi.fn(),
}));

vi.mock('@/lib/repositories/download-event-repository', () => {
  const MockDownloadEventRepository = vi.fn();
  MockDownloadEventRepository.prototype.getAnalyticsByRelease = mockGetAnalyticsByRelease;
  MockDownloadEventRepository.prototype.getUniqueUsers = mockGetUniqueUsers;
  MockDownloadEventRepository.prototype.getTotalDownloads = mockGetTotalDownloads;
  return { DownloadEventRepository: MockDownloadEventRepository };
});

const releaseId = 'release-abc123';
const context = { params: Promise.resolve({ id: releaseId }) };

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/releases/[id]/download-analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnalyticsByRelease.mockResolvedValue([
      { formatType: 'MP3_320KBPS', count: 100 },
      { formatType: 'FLAC', count: 50 },
    ]);
    mockGetUniqueUsers.mockResolvedValue(25);
    mockGetTotalDownloads.mockResolvedValue(150);
  });

  it('should return analytics without date range', async () => {
    const request = createRequest(`/api/releases/${releaseId}/download-analytics`);

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.releaseId).toBe(releaseId);
    expect(data.totalDownloads).toBe(150);
    expect(data.uniqueUsers).toBe(25);
    expect(data.formatBreakdown).toEqual([
      { formatType: 'MP3_320KBPS', count: 100 },
      { formatType: 'FLAC', count: 50 },
    ]);
    expect(data.dateRange).toBeUndefined();
  });

  it('should pass date range to repository methods', async () => {
    const request = createRequest(
      `/api/releases/${releaseId}/download-analytics?startDate=2026-01-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.999Z`
    );

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dateRange).toBeDefined();
    expect(data.dateRange.startDate).toBe('2026-01-01T00:00:00.000Z');
    expect(data.dateRange.endDate).toBe('2026-06-30T23:59:59.999Z');
  });

  it('should return 400 for invalid startDate', async () => {
    const request = createRequest(
      `/api/releases/${releaseId}/download-analytics?startDate=not-a-date`
    );

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid startDate format');
  });

  it('should return 400 for invalid endDate', async () => {
    const request = createRequest(`/api/releases/${releaseId}/download-analytics?endDate=garbage`);

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid endDate format');
  });

  it('should handle only startDate filter', async () => {
    const request = createRequest(
      `/api/releases/${releaseId}/download-analytics?startDate=2026-03-01T00:00:00.000Z`
    );

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dateRange.startDate).toBe('2026-03-01T00:00:00.000Z');
    expect(data.dateRange.endDate).toBeNull();
  });

  it('should return 500 when repository throws', async () => {
    mockGetTotalDownloads.mockRejectedValue(new Error('DB error'));

    const request = createRequest(`/api/releases/${releaseId}/download-analytics`);

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch analytics');
  });

  it('should return empty format breakdown when no downloads exist', async () => {
    mockGetAnalyticsByRelease.mockResolvedValue([]);
    mockGetUniqueUsers.mockResolvedValue(0);
    mockGetTotalDownloads.mockResolvedValue(0);

    const request = createRequest(`/api/releases/${releaseId}/download-analytics`);

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalDownloads).toBe(0);
    expect(data.uniqueUsers).toBe(0);
    expect(data.formatBreakdown).toEqual([]);
  });
});
