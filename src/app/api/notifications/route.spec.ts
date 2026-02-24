// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NotificationBannerService } from '@/lib/services/notification-banner-service';

import { GET } from './route';

vi.mock('@/lib/services/notification-banner-service', () => ({
  NotificationBannerService: {
    getActiveNotificationBanners: vi.fn(),
  },
}));

describe('Notifications API Routes', () => {
  const mockNotifications = [
    {
      id: 'notification-123',
      message: 'Test Notification',
      secondaryMessage: 'Secondary message',
      notes: '',
      originalImageUrl: '',
      imageUrl: 'https://example.com/image.jpg',
      linkUrl: '',
      backgroundColor: '#000000',
      isOverlayed: true,
      isActive: true,
      displayFrom: null,
      displayUntil: null,
      messageFont: 'system-ui',
      messageFontSize: 2.5,
      messageContrast: 100,
      secondaryMessageFont: 'system-ui',
      secondaryMessageFontSize: 2,
      secondaryMessageContrast: 95,
      messageTextColor: '#ffffff',
      secondaryMessageTextColor: '#ffffff',
      messageTextShadow: true,
      messageTextShadowDarkness: 50,
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 50,
      messagePositionX: 50,
      messagePositionY: 10,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 90,
      messageRotation: 0,
      secondaryMessageRotation: 0,
      imageOffsetX: 0,
      imageOffsetY: 0,
      messageWidth: 80,
      messageHeight: 30,
      secondaryMessageWidth: 80,
      secondaryMessageHeight: 30,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/notifications', () => {
    it('should return active notification banners', async () => {
      vi.mocked(NotificationBannerService.getActiveNotificationBanners).mockResolvedValue({
        success: true,
        data: mockNotifications as never,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockNotifications);
      expect(NotificationBannerService.getActiveNotificationBanners).toHaveBeenCalledWith(
        expect.any(Date)
      );
    });

    it('should return an empty array when no active notifications', async () => {
      vi.mocked(NotificationBannerService.getActiveNotificationBanners).mockResolvedValue({
        success: true,
        data: [] as never,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(NotificationBannerService.getActiveNotificationBanners).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(NotificationBannerService.getActiveNotificationBanners).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve notifications',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve notifications' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(NotificationBannerService.getActiveNotificationBanners).mockRejectedValue(
        Error('Unexpected error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
