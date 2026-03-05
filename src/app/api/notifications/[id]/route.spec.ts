// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { NotificationBannerService } from '@/lib/services/notification-banner-service';

import { GET, PATCH, DELETE } from './route';

vi.mock('@/lib/services/notification-banner-service', () => ({
  NotificationBannerService: {
    getNotificationBannerById: vi.fn(),
    updateNotificationBanner: vi.fn(),
    deleteNotificationBanner: vi.fn(),
  },
}));

describe('Notification Banner by ID API Routes', () => {
  const mockNotification = {
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
  };

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/notifications/[id]', () => {
    it('should return a notification banner by ID', async () => {
      vi.mocked(NotificationBannerService.getNotificationBannerById).mockResolvedValue({
        success: true,
        data: mockNotification as never,
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123');
      const response = await GET(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockNotification);
      expect(NotificationBannerService.getNotificationBannerById).toHaveBeenCalledWith(
        'notification-123'
      );
    });

    it('should return 404 when notification banner not found', async () => {
      vi.mocked(NotificationBannerService.getNotificationBannerById).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Notification banner not found' });
    });

    it('should return 404 when result data is null', async () => {
      vi.mocked(NotificationBannerService.getNotificationBannerById).mockResolvedValue({
        success: true,
        data: null as never,
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123');
      const response = await GET(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Notification banner not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(NotificationBannerService.getNotificationBannerById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123');
      const response = await GET(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(NotificationBannerService.getNotificationBannerById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve notification banner',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123');
      const response = await GET(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve notification banner' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(NotificationBannerService.getNotificationBannerById).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123');
      const response = await GET(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PATCH /api/notifications/[id]', () => {
    it('should update a notification banner successfully', async () => {
      const updatedNotification = { ...mockNotification, message: 'Updated Notification' };
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: true,
        data: updatedNotification as never,
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'PATCH',
        body: JSON.stringify({ message: 'Updated Notification' }),
      });
      const response = await PATCH(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(updatedNotification);
      expect(NotificationBannerService.updateNotificationBanner).toHaveBeenCalledWith(
        'notification-123',
        expect.objectContaining({
          message: 'Updated Notification',
        })
      );
    });

    it('should return 400 when validation fails', async () => {
      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'PATCH',
        body: JSON.stringify({
          message: 'x'.repeat(501),
        }),
      });
      const response = await PATCH(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(NotificationBannerService.updateNotificationBanner).not.toHaveBeenCalled();
    });

    it('should return 404 when notification banner not found', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/non-existent', {
        method: 'PATCH',
        body: JSON.stringify({ message: 'Updated Notification' }),
      });
      const response = await PATCH(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Notification banner not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'PATCH',
        body: JSON.stringify({ message: 'Updated Notification' }),
      });
      const response = await PATCH(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Failed to update notification banner',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'PATCH',
        body: JSON.stringify({ message: 'Updated Notification' }),
      });
      const response = await PATCH(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update notification banner' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'PATCH',
        body: JSON.stringify({ message: 'Updated Notification' }),
      });
      const response = await PATCH(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle partial updates with single field', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: true,
        data: { ...mockNotification, secondaryMessage: 'Updated secondary' } as never,
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'PATCH',
        body: JSON.stringify({ secondaryMessage: 'Updated secondary' }),
      });
      const response = await PATCH(request, createParams('notification-123'));

      expect(response.status).toBe(200);
      expect(NotificationBannerService.updateNotificationBanner).toHaveBeenCalledWith(
        'notification-123',
        expect.objectContaining({
          secondaryMessage: 'Updated secondary',
        })
      );
    });
  });

  describe('DELETE /api/notifications/[id]', () => {
    it('should delete a notification banner successfully', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotification as never,
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(NotificationBannerService.deleteNotificationBanner).toHaveBeenCalledWith(
        'notification-123'
      );
    });

    it('should return 404 when notification banner not found', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Notification banner not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Failed to delete notification banner',
      });

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete notification banner' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest('http://localhost:3000/api/notifications/notification-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('notification-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
