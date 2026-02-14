import { Prisma } from '@prisma/client';

import { NotificationBannerService } from './notification-banner-service';
import { prisma } from '../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock the cache utility
vi.mock('../utils/simple-cache', () => ({
  withCache: vi.fn((_, fn) => fn()),
}));

describe('NotificationBannerService', () => {
  const mockNotification = {
    id: 'notification-123',
    message: 'Test notification',
    secondaryMessage: 'Secondary message',
    notes: 'Internal notes',
    originalImageUrl: 'https://example.com/original.jpg',
    imageUrl: 'https://example.com/image.jpg',
    linkUrl: 'https://example.com/link',
    backgroundColor: '#000000',
    isOverlayed: true,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    displayFrom: null,
    displayUntil: null,
    addedById: 'user-123',
    publishedAt: new Date('2024-01-01'),
    publishedBy: 'user-123',
    // Font styling for message
    messageFont: null,
    messageFontSize: null,
    messageContrast: null,
    // Font styling for secondary message
    secondaryMessageFont: null,
    secondaryMessageFontSize: null,
    secondaryMessageContrast: null,
    // Text color settings
    messageTextColor: null,
    secondaryMessageTextColor: null,
    // Text shadow settings
    messageTextShadow: null,
    messageTextShadowDarkness: null,
    secondaryMessageTextShadow: null,
    secondaryMessageTextShadowDarkness: null,
    // Text position settings
    messagePositionX: null,
    messagePositionY: null,
    secondaryMessagePositionX: null,
    secondaryMessagePositionY: null,
    // Text rotation settings
    messageRotation: null,
    secondaryMessageRotation: null,
    // Image offset settings
    imageOffsetX: null,
    imageOffsetY: null,
    // Text box dimension settings
    messageWidth: null,
    messageHeight: null,
    secondaryMessageWidth: null,
    secondaryMessageHeight: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNotificationBanner', () => {
    const createInput: Prisma.NotificationUncheckedCreateInput = {
      message: 'Test notification',
      addedById: 'user-123',
    };

    it('should create a notification banner successfully', async () => {
      vi.mocked(prisma.notification.create).mockResolvedValue(mockNotification);

      const result = await NotificationBannerService.createNotificationBanner(createInput);

      expect(result).toMatchObject({ success: true, data: mockNotification });
      expect(prisma.notification.create).toHaveBeenCalledWith({ data: createInput });
    });

    it('should return error on database connection failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );
      vi.mocked(prisma.notification.create).mockRejectedValue(prismaError);

      const result = await NotificationBannerService.createNotificationBanner(createInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error on unexpected failure', async () => {
      vi.mocked(prisma.notification.create).mockRejectedValue(new Error('Unexpected error'));

      const result = await NotificationBannerService.createNotificationBanner(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to create notification banner: Unexpected error',
      });
    });
  });

  describe('getActiveNotificationBanners', () => {
    it('should return active notifications successfully', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([mockNotification]);

      const result = await NotificationBannerService.getActiveNotificationBanners(new Date());

      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(1);
      expect((result as { success: true; data: (typeof mockNotification)[] }).data[0]).toEqual(
        mockNotification
      );
    });

    it('should filter by isActive, publishedAt, and date range', async () => {
      const currentDate = new Date('2024-06-15');
      vi.mocked(prisma.notification.findMany).mockResolvedValue([mockNotification]);

      await NotificationBannerService.getActiveNotificationBanners(currentDate);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          publishedAt: { not: null },
          OR: [{ displayFrom: null }, { displayFrom: { lte: currentDate } }],
          AND: [{ OR: [{ displayUntil: null }, { displayUntil: { gte: currentDate } }] }],
        },
        orderBy: { publishedAt: 'desc' },
      });
    });

    it('should return error on database connection failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );
      vi.mocked(prisma.notification.findMany).mockRejectedValue(prismaError);

      const result = await NotificationBannerService.getActiveNotificationBanners(new Date());

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });
  });

  describe('getAllNotificationBanners', () => {
    it('should return all notifications with default pagination', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([mockNotification]);

      const result = await NotificationBannerService.getAllNotificationBanners();

      expect(result.success).toBe(true);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 50,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      });
    });

    it('should support search filtering', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([mockNotification]);

      await NotificationBannerService.getAllNotificationBanners({ search: 'test' });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { message: { contains: 'test', mode: 'insensitive' } },
            { secondaryMessage: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 50,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      });
    });

    it('should support custom pagination', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

      await NotificationBannerService.getAllNotificationBanners({ skip: 10, take: 20 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 20,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      });
    });
  });

  describe('getNotificationBannerById', () => {
    it('should return notification by ID successfully', async () => {
      vi.mocked(prisma.notification.findUnique).mockResolvedValue(mockNotification);

      const result = await NotificationBannerService.getNotificationBannerById('notification-123');

      expect(result).toMatchObject({ success: true, data: mockNotification });
      expect(prisma.notification.findUnique).toHaveBeenCalledWith({
        where: { id: 'notification-123' },
      });
    });

    it('should return null when notification not found', async () => {
      vi.mocked(prisma.notification.findUnique).mockResolvedValue(null);

      const result = await NotificationBannerService.getNotificationBannerById('non-existent');

      expect(result).toMatchObject({ success: true, data: null });
    });
  });

  describe('updateNotificationBanner', () => {
    const updateInput: Prisma.NotificationUpdateInput = {
      message: 'Updated message',
    };

    it('should update notification successfully', async () => {
      const updatedNotification = { ...mockNotification, message: 'Updated message' };
      vi.mocked(prisma.notification.update).mockResolvedValue(updatedNotification);

      const result = await NotificationBannerService.updateNotificationBanner(
        'notification-123',
        updateInput
      );

      expect(result.success).toBe(true);
      expect((result as { success: true; data: { message: string } }).data.message).toBe(
        'Updated message'
      );
    });

    it('should return error when notification not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.notification.update).mockRejectedValue(prismaError);

      const result = await NotificationBannerService.updateNotificationBanner(
        'non-existent',
        updateInput
      );

      expect(result).toMatchObject({ success: false, error: 'Notification banner not found' });
    });
  });

  describe('deleteNotificationBanner', () => {
    it('should delete notification successfully', async () => {
      vi.mocked(prisma.notification.delete).mockResolvedValue(mockNotification);

      const result = await NotificationBannerService.deleteNotificationBanner('notification-123');

      expect(result.success).toBe(true);
      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notification-123' },
      });
    });

    it('should return error when notification not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.notification.delete).mockRejectedValue(prismaError);

      const result = await NotificationBannerService.deleteNotificationBanner('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Notification banner not found' });
    });
  });

  describe('publishNotificationBanner', () => {
    it('should publish notification successfully', async () => {
      const publishedNotification = {
        ...mockNotification,
        publishedAt: new Date(),
        publishedBy: 'admin-user',
      };
      vi.mocked(prisma.notification.update).mockResolvedValue(publishedNotification);

      const result = await NotificationBannerService.publishNotificationBanner(
        'notification-123',
        'admin-user'
      );

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { publishedAt: unknown; publishedBy: string } }).data
          .publishedAt
      ).toBeDefined();
      expect(
        (result as { success: true; data: { publishedAt: unknown; publishedBy: string } }).data
          .publishedBy
      ).toBe('admin-user');
    });

    it('should return error when notification not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.notification.update).mockRejectedValue(prismaError);

      const result = await NotificationBannerService.publishNotificationBanner(
        'non-existent',
        'admin-user'
      );

      expect(result).toMatchObject({ success: false, error: 'Notification banner not found' });
    });
  });

  describe('unpublishNotificationBanner', () => {
    it('should unpublish notification successfully', async () => {
      const unpublishedNotification = {
        ...mockNotification,
        publishedAt: null,
        publishedBy: null,
      };
      vi.mocked(prisma.notification.update).mockResolvedValue(unpublishedNotification);

      const result =
        await NotificationBannerService.unpublishNotificationBanner('notification-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { publishedAt: null; publishedBy: null } }).data
          .publishedAt
      ).toBeNull();
      expect(
        (result as { success: true; data: { publishedAt: null; publishedBy: null } }).data
          .publishedBy
      ).toBeNull();
    });

    it('should return error when notification not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.notification.update).mockRejectedValue(prismaError);

      const result = await NotificationBannerService.unpublishNotificationBanner('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Notification banner not found' });
    });

    it('should return error on database connection failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );
      vi.mocked(prisma.notification.update).mockRejectedValue(prismaError);

      const result =
        await NotificationBannerService.unpublishNotificationBanner('notification-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error on unexpected failure', async () => {
      vi.mocked(prisma.notification.update).mockRejectedValue(new Error('Unexpected'));

      const result =
        await NotificationBannerService.unpublishNotificationBanner('notification-123');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to unpublish notification banner',
      });
    });
  });

  describe('error handling', () => {
    describe('getActiveNotificationBanners errors', () => {
      it('should return generic error on unexpected failure', async () => {
        vi.mocked(prisma.notification.findMany).mockRejectedValue(new Error('Unexpected'));

        const result = await NotificationBannerService.getActiveNotificationBanners(new Date());

        expect(result).toMatchObject({
          success: false,
          error: 'Failed to fetch notification banners',
        });
      });
    });

    describe('getAllNotificationBanners errors', () => {
      it('should return error on database connection failure', async () => {
        const prismaError = new Prisma.PrismaClientInitializationError(
          'Database connection failed',
          '5.0.0'
        );
        vi.mocked(prisma.notification.findMany).mockRejectedValue(prismaError);

        const result = await NotificationBannerService.getAllNotificationBanners();

        expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
      });

      it('should return generic error on unexpected failure', async () => {
        vi.mocked(prisma.notification.findMany).mockRejectedValue(new Error('Unexpected'));

        const result = await NotificationBannerService.getAllNotificationBanners();

        expect(result).toMatchObject({
          success: false,
          error: 'Failed to retrieve notification banners',
        });
      });
    });

    describe('getNotificationBannerById errors', () => {
      it('should return error on database connection failure', async () => {
        const prismaError = new Prisma.PrismaClientInitializationError(
          'Database connection failed',
          '5.0.0'
        );
        vi.mocked(prisma.notification.findUnique).mockRejectedValue(prismaError);

        const result =
          await NotificationBannerService.getNotificationBannerById('notification-123');

        expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
      });

      it('should return generic error on unexpected failure', async () => {
        vi.mocked(prisma.notification.findUnique).mockRejectedValue(new Error('Unexpected'));

        const result =
          await NotificationBannerService.getNotificationBannerById('notification-123');

        expect(result).toMatchObject({
          success: false,
          error: 'Failed to fetch notification banner',
        });
      });
    });

    describe('updateNotificationBanner errors', () => {
      it('should return error on database connection failure', async () => {
        const prismaError = new Prisma.PrismaClientInitializationError(
          'Database connection failed',
          '5.0.0'
        );
        vi.mocked(prisma.notification.update).mockRejectedValue(prismaError);

        const result = await NotificationBannerService.updateNotificationBanner(
          'notification-123',
          {
            message: 'Updated',
          }
        );

        expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
      });

      it('should return generic error on unexpected failure', async () => {
        vi.mocked(prisma.notification.update).mockRejectedValue(new Error('Unexpected'));

        const result = await NotificationBannerService.updateNotificationBanner(
          'notification-123',
          {
            message: 'Updated',
          }
        );

        expect(result).toMatchObject({
          success: false,
          error: 'Failed to update notification banner',
        });
      });
    });

    describe('deleteNotificationBanner errors', () => {
      it('should return error on database connection failure', async () => {
        const prismaError = new Prisma.PrismaClientInitializationError(
          'Database connection failed',
          '5.0.0'
        );
        vi.mocked(prisma.notification.delete).mockRejectedValue(prismaError);

        const result = await NotificationBannerService.deleteNotificationBanner('notification-123');

        expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
      });

      it('should return generic error on unexpected failure', async () => {
        vi.mocked(prisma.notification.delete).mockRejectedValue(new Error('Unexpected'));

        const result = await NotificationBannerService.deleteNotificationBanner('notification-123');

        expect(result).toMatchObject({
          success: false,
          error: 'Failed to delete notification banner',
        });
      });
    });

    describe('publishNotificationBanner errors', () => {
      it('should return error on database connection failure', async () => {
        const prismaError = new Prisma.PrismaClientInitializationError(
          'Database connection failed',
          '5.0.0'
        );
        vi.mocked(prisma.notification.update).mockRejectedValue(prismaError);

        const result = await NotificationBannerService.publishNotificationBanner(
          'notification-123',
          'user-123'
        );

        expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
      });

      it('should return generic error on unexpected failure', async () => {
        vi.mocked(prisma.notification.update).mockRejectedValue(new Error('Unexpected'));

        const result = await NotificationBannerService.publishNotificationBanner(
          'notification-123',
          'user-123'
        );

        expect(result).toMatchObject({
          success: false,
          error: 'Failed to publish notification banner',
        });
      });
    });
  });
});
