/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { BannerNotificationService } from '@/lib/services/banner-notification-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

// Mock rate limiting to pass through
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) => (handler: Function) => (req: unknown, ctx: unknown) =>
      handler(req, ctx),
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: {},
  PUBLIC_LIMIT: 100,
}));

vi.mock('@/lib/services/banner-notification-service', () => ({
  BannerNotificationService: {
    getActiveBanners: vi.fn(),
    getAllNotifications: vi.fn(),
  },
}));

describe('GET /api/notification-banners', () => {
  const dummyContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return banners and rotationInterval on success', async () => {
    const mockResponse = {
      banners: [
        { slotNumber: 1, imageFilename: 'banner1.webp', notification: null },
        { slotNumber: 2, imageFilename: 'banner2.webp', notification: null },
      ],
      rotationInterval: 5,
    };

    vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
      success: true,
      data: mockResponse,
    } as never);

    const request = new NextRequest('http://localhost:3000/api/notification-banners');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(BannerNotificationService.getActiveBanners).toHaveBeenCalled();
    expect(data).toEqual(mockResponse);
    expect(response.status).toBe(200);
  });

  it('should return 500 when service fails', async () => {
    vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
      success: false,
      error: 'Database error',
    } as never);

    const request = new NextRequest('http://localhost:3000/api/notification-banners');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Database error' });
  });

  it('should return empty banners array with rotationInterval when no active banners exist', async () => {
    const mockResponse = {
      banners: [],
      rotationInterval: 5,
    };

    vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
      success: true,
      data: mockResponse,
    } as never);

    const request = new NextRequest('http://localhost:3000/api/notification-banners');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(data).toEqual(mockResponse);
    expect(response.status).toBe(200);
  });

  describe('all=true mode', () => {
    it('should return banners and notifications when all=true', async () => {
      const mockBanners = {
        banners: [{ slotNumber: 1, imageFilename: 'banner1.webp', notification: null }],
        rotationInterval: 5,
      };
      const mockNotifications = [{ id: 'notif-1', content: 'Test notification' }];

      vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
        success: true,
        data: mockBanners,
      } as never);
      vi.mocked(BannerNotificationService.getAllNotifications).mockResolvedValue({
        success: true,
        data: mockNotifications,
      } as never);

      const request = new NextRequest('http://localhost:3000/api/notification-banners?all=true');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.banners).toEqual(mockBanners);
      expect(data.notifications).toEqual(mockNotifications);
    });

    it('should return fallback data when services fail in all mode', async () => {
      vi.mocked(BannerNotificationService.getActiveBanners).mockResolvedValue({
        success: false,
        error: 'Banners failed',
      } as never);
      vi.mocked(BannerNotificationService.getAllNotifications).mockResolvedValue({
        success: false,
        error: 'Notifications failed',
      } as never);

      const request = new NextRequest('http://localhost:3000/api/notification-banners?all=true');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.banners).toEqual({ banners: [], rotationInterval: 5000 });
      expect(data.notifications).toEqual([]);
    });
  });
});
