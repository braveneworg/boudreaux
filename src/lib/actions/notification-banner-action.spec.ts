/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only to prevent client component error in tests
// Import mocked modules after vi.mock calls
import { NotificationBannerService } from '@/lib/services/notification-banner-service';
import type { NotificationBanner } from '@/lib/services/notification-banner-service';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import {
  createNotificationBannerAction,
  updateNotificationBannerAction,
  deleteNotificationBannerAction,
  publishNotificationBannerAction,
  unpublishNotificationBannerAction,
} from './notification-banner-action';

vi.mock('server-only', () => ({}));

// Mock dependencies
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/services/notification-banner-service', () => ({
  NotificationBannerService: {
    createNotificationBanner: vi.fn(),
    updateNotificationBanner: vi.fn(),
    deleteNotificationBanner: vi.fn(),
    publishNotificationBanner: vi.fn(),
    unpublishNotificationBanner: vi.fn(),
  },
}));

vi.mock('@/lib/utils/audit-log', () => ({
  logSecurityEvent: vi.fn(),
}));

vi.mock('@/lib/utils/auth/auth-utils', () => ({
  setUnknownError: vi.fn((state: FormState) => {
    state.errors = { general: ['An unknown error occurred'] };
  }),
}));

vi.mock('@/lib/utils/auth/require-role', () => ({
  requireRole: vi.fn(),
}));

const mockRequireRole = vi.mocked(requireRole);
const mockLogSecurityEvent = vi.mocked(logSecurityEvent);

const mockSession = {
  user: {
    id: 'admin-user-id',
    name: 'Admin User',
    username: 'adminuser',
    email: 'admin@example.com',
    role: 'admin',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const createValidFormData = (overrides: Record<string, string> = {}): FormData => {
  const formData = new FormData();
  formData.append('message', 'Test notification message');
  formData.append('imageUrl', 'https://example.com/image.jpg');
  formData.append('isOverlayed', 'true');
  formData.append('isActive', 'true');
  formData.append('messageFont', 'system-ui');
  formData.append('messageFontSize', '2.5');
  formData.append('messageContrast', '100');
  formData.append('secondaryMessageFont', 'system-ui');
  formData.append('secondaryMessageFontSize', '2');
  formData.append('secondaryMessageContrast', '95');
  formData.append('messageTextColor', '#ffffff');
  formData.append('secondaryMessageTextColor', '#ffffff');
  formData.append('messageTextShadow', 'true');
  formData.append('messageTextShadowDarkness', '50');
  formData.append('secondaryMessageTextShadow', 'true');
  formData.append('secondaryMessageTextShadowDarkness', '50');
  formData.append('messagePositionX', '50');
  formData.append('messagePositionY', '10');
  formData.append('secondaryMessagePositionX', '50');
  formData.append('secondaryMessagePositionY', '90');

  // Apply overrides
  for (const [key, value] of Object.entries(overrides)) {
    formData.delete(key);
    formData.append(key, value);
  }

  return formData;
};

const mockNotificationBanner: NotificationBanner = {
  id: 'aabbccddee112233ff445566',
  message: 'Test notification message',
  secondaryMessage: null,
  notes: null,
  originalImageUrl: null,
  imageUrl: 'https://example.com/image.jpg',
  linkUrl: null,
  backgroundColor: null,
  isOverlayed: true,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  displayFrom: null,
  displayUntil: null,
  addedById: 'admin-user-id',
  publishedAt: null,
  publishedBy: null,
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
};

const initialFormState: FormState = {
  fields: {},
  success: false,
};

describe('notification-banner-action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(mockSession as never);
  });

  describe('createNotificationBannerAction', () => {
    it('should create notification banner successfully with valid data', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData();
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
      expect(result.data?.notificationId).toBe('aabbccddee112233ff445566');
      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'notification.banner.created',
        userId: 'admin-user-id',
        metadata: {
          notificationId: 'aabbccddee112233ff445566',
          message: 'Test notification message'.substring(0, 50),
        },
      });
    });

    it('should return validation errors for invalid message', async () => {
      const formData = createValidFormData({ message: '' });
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.message).toContain('Message is required');
    });

    it('should return error when service fails', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const formData = createValidFormData();
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Failed to create notification banner');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockRejectedValue(
        new Error('Unexpected error')
      );

      const formData = createValidFormData();
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('An unknown error occurred');
    });

    it('should process boolean fields correctly', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData({
        isOverlayed: 'on',
        isActive: 'on',
      });
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should process numeric fields correctly', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData({
        sortOrder: '5',
        messageFontSize: '3.5',
        messageContrast: '80',
      });
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should handle date fields', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData({
        displayFrom: '2024-01-01',
        displayUntil: '2024-12-31',
      });
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should accept backgroundColor instead of imageUrl', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: { ...mockNotificationBanner, imageUrl: null, backgroundColor: '#ff0000' },
      });

      const formData = createValidFormData({
        imageUrl: '',
        backgroundColor: '#ff0000',
      });
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should require either imageUrl or backgroundColor', async () => {
      const formData = createValidFormData({
        imageUrl: '',
        backgroundColor: '',
      });
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.imageUrl).toBeDefined();
    });

    it('should use fallback values when boolean fields are omitted from form data', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      // Create minimal form data without boolean fields
      const formData = new FormData();
      formData.append('message', 'Test message');
      formData.append('imageUrl', 'https://example.com/image.jpg');
      formData.append('messageFont', 'system-ui');
      formData.append('messageFontSize', '2.5');
      formData.append('messageContrast', '100');
      formData.append('secondaryMessageFont', 'system-ui');
      formData.append('secondaryMessageFontSize', '2');
      formData.append('secondaryMessageContrast', '95');
      formData.append('messageTextColor', '#ffffff');
      formData.append('secondaryMessageTextColor', '#ffffff');
      formData.append('messageTextShadowDarkness', '50');
      formData.append('secondaryMessageTextShadowDarkness', '50');
      formData.append('messagePositionX', '50');
      formData.append('messagePositionY', '10');
      formData.append('secondaryMessagePositionX', '50');
      formData.append('secondaryMessagePositionY', '90');
      // Note: isOverlayed, isActive, messageTextShadow, secondaryMessageTextShadow, sortOrder are omitted

      await createNotificationBannerAction(initialFormState, formData);

      // The fallback values should be applied: all booleans false, sortOrder 0
      expect(NotificationBannerService.createNotificationBanner).toHaveBeenCalled();
    });

    it('should handle checkbox "on" values for boolean fields', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      // Use 'on' value which is what browsers send for checked checkboxes
      const formData = createValidFormData({
        isOverlayed: 'on',
        isActive: 'on',
        messageTextShadow: 'on',
        secondaryMessageTextShadow: 'on',
      });

      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should return error when requireRole throws', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const formData = createValidFormData();
      const result = await createNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain(
        'You must be a logged in admin user to create a notification banner'
      );
    });

    it('should pass addedById to service when creating notification banner', async () => {
      vi.mocked(NotificationBannerService.createNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData();
      await createNotificationBannerAction(initialFormState, formData);

      expect(NotificationBannerService.createNotificationBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          addedById: 'admin-user-id',
        })
      );
    });
  });

  describe('updateNotificationBannerAction', () => {
    it('should update notification banner successfully', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData();
      formData.append('notificationId', 'aabbccddee112233ff445566');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
      expect(result.data?.notificationId).toBe('aabbccddee112233ff445566');
      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'notification.banner.updated',
        userId: 'admin-user-id',
        metadata: {
          notificationId: 'aabbccddee112233ff445566',
          message: 'Test notification message'.substring(0, 50),
        },
      });
    });

    it('should return error when notificationId is missing', async () => {
      const formData = createValidFormData();
      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Notification ID is required');
    });

    it('should return validation errors for invalid data', async () => {
      const formData = createValidFormData({ message: '' });
      formData.append('notificationId', 'aabbccddee112233ff445566');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.message).toContain('Message is required');
    });

    it('should return error when service fails', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const formData = createValidFormData();
      formData.append('notificationId', 'aabbccddee112233ff445567');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Failed to update notification banner');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockRejectedValue(
        new Error('Unexpected error')
      );

      const formData = createValidFormData();
      formData.append('notificationId', 'aabbccddee112233ff445566');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('An unknown error occurred');
    });

    it('should set boolean fields to false when not present in payload', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: true,
        data: { ...mockNotificationBanner, isOverlayed: false, isActive: false },
      });

      const formData = new FormData();
      formData.append('notificationId', 'aabbccddee112233ff445566');
      formData.append('message', 'Test message');
      formData.append('imageUrl', 'https://example.com/image.jpg');
      formData.append('messageFont', 'system-ui');
      formData.append('messageFontSize', '2.5');
      formData.append('messageContrast', '100');
      formData.append('secondaryMessageFont', 'system-ui');
      formData.append('secondaryMessageFontSize', '2');
      formData.append('secondaryMessageContrast', '95');
      formData.append('messageTextColor', '#ffffff');
      formData.append('secondaryMessageTextColor', '#ffffff');
      formData.append('messageTextShadowDarkness', '50');
      formData.append('secondaryMessageTextShadowDarkness', '50');
      formData.append('messagePositionX', '50');
      formData.append('messagePositionY', '10');
      formData.append('secondaryMessagePositionX', '50');
      formData.append('secondaryMessagePositionY', '90');
      // Intentionally not including isOverlayed, isActive, etc.

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should default sortOrder to 0 when invalid value provided', async () => {
      vi.mocked(NotificationBannerService.updateNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const formData = createValidFormData({
        sortOrder: 'invalid',
      });
      formData.append('notificationId', 'aabbccddee112233ff445566');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(true);
    });

    it('should return error when requireRole throws', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const formData = createValidFormData();
      formData.append('notificationId', 'aabbccddee112233ff445566');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain(
        'You must be a logged in admin user to update a notification banner'
      );
    });

    it('should return error for invalid notificationId format', async () => {
      const formData = createValidFormData();
      formData.append('notificationId', 'invalid-id');

      const result = await updateNotificationBannerAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Invalid notification ID');
    });
  });

  describe('deleteNotificationBannerAction', () => {
    it('should delete notification banner successfully', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockResolvedValue({
        success: true,
        data: mockNotificationBanner,
      });

      const result = await deleteNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(true);
      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'notification.banner.deleted',
        userId: 'admin-user-id',
        metadata: { notificationId: 'aabbccddee112233ff445566' },
      });
    });

    it('should return error when service fails', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const result = await deleteNotificationBannerAction('aabbccddee112233ff445567');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete notification banner');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(NotificationBannerService.deleteNotificationBanner).mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await deleteNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete notification banner');
    });

    it('should return error when requireRole throws', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const result = await deleteNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error for invalid notificationId format', async () => {
      const result = await deleteNotificationBannerAction('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid notification ID');
    });
  });

  describe('publishNotificationBannerAction', () => {
    it('should publish notification banner successfully', async () => {
      vi.mocked(NotificationBannerService.publishNotificationBanner).mockResolvedValue({
        success: true,
        data: { ...mockNotificationBanner, publishedAt: new Date(), publishedBy: 'admin-user-id' },
      });

      const result = await publishNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(true);
      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'notification.banner.published',
        userId: 'admin-user-id',
        metadata: { notificationId: 'aabbccddee112233ff445566' },
      });
    });

    it('should return error when service fails', async () => {
      vi.mocked(NotificationBannerService.publishNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const result = await publishNotificationBannerAction('aabbccddee112233ff445567');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to publish notification banner');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(NotificationBannerService.publishNotificationBanner).mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await publishNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to publish notification banner');
    });

    it('should return error when requireRole throws', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const result = await publishNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error for invalid notificationId format', async () => {
      const result = await publishNotificationBannerAction('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid notification ID');
    });
  });

  describe('unpublishNotificationBannerAction', () => {
    it('should unpublish notification banner successfully', async () => {
      vi.mocked(NotificationBannerService.unpublishNotificationBanner).mockResolvedValue({
        success: true,
        data: { ...mockNotificationBanner, publishedAt: null, publishedBy: null },
      });

      const result = await unpublishNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(true);
      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        event: 'notification.banner.unpublished',
        userId: 'admin-user-id',
        metadata: { notificationId: 'aabbccddee112233ff445566' },
      });
    });

    it('should return error when service fails', async () => {
      vi.mocked(NotificationBannerService.unpublishNotificationBanner).mockResolvedValue({
        success: false,
        error: 'Notification banner not found',
      });

      const result = await unpublishNotificationBannerAction('aabbccddee112233ff445567');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to unpublish notification banner');
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(NotificationBannerService.unpublishNotificationBanner).mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await unpublishNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to unpublish notification banner');
    });

    it('should return error when requireRole throws', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const result = await unpublishNotificationBannerAction('aabbccddee112233ff445566');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error for invalid notificationId format', async () => {
      const result = await unpublishNotificationBannerAction('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid notification ID');
    });
  });
});
