/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { BannerNotificationService } from '@/lib/services/banner-notification-service';
import type { FormState } from '@/lib/types/form-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import {
  createOrUpdateBannerNotificationAction,
  deleteBannerNotificationAction,
  updateRotationIntervalAction,
} from './banner-notification-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/services/banner-notification-service', () => ({
  BannerNotificationService: {
    upsertNotification: vi.fn(),
    deleteNotification: vi.fn(),
    updateRotationInterval: vi.fn(),
  },
}));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { notifications: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } },
}));

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@test.com' },
};

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const buildFormData = (fields: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
};

const validPayload: Record<string, string> = {
  slotNumber: '1',
  content: 'Hello world',
  textColor: '#ffffff',
  backgroundColor: '#000000',
  displayFrom: '',
  displayUntil: '',
  repostedFromId: '',
};

describe('banner-notification-action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('createOrUpdateBannerNotificationAction', () => {
    it('should return unauthorized when requireRole rejects', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await createOrUpdateBannerNotificationAction(
        initialFormState,
        buildFormData(validPayload)
      );

      expect(result.success).toBe(false);
      expect(result.errors?._form).toContain('Unauthorized');
      expect(BannerNotificationService.upsertNotification).not.toHaveBeenCalled();
    });

    it('should return field errors when validation fails', async () => {
      const invalidPayload = { ...validPayload, slotNumber: '0' };

      const result = await createOrUpdateBannerNotificationAction(
        initialFormState,
        buildFormData(invalidPayload)
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.slotNumber).toBeDefined();
      expect(BannerNotificationService.upsertNotification).not.toHaveBeenCalled();
    });

    it('should return field errors for invalid hex color', async () => {
      const invalidPayload = { ...validPayload, textColor: 'not-a-color' };

      const result = await createOrUpdateBannerNotificationAction(
        initialFormState,
        buildFormData(invalidPayload)
      );

      expect(result.success).toBe(false);
      expect(result.errors?.textColor).toBeDefined();
    });

    it('should return form error when service fails', async () => {
      vi.mocked(BannerNotificationService.upsertNotification).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      const result = await createOrUpdateBannerNotificationAction(
        initialFormState,
        buildFormData(validPayload)
      );

      expect(result.success).toBe(false);
      expect(result.errors?._form).toContain('Database error');
    });

    it('should return success with notificationId and revalidate paths', async () => {
      vi.mocked(BannerNotificationService.upsertNotification).mockResolvedValue({
        success: true,
        data: { id: 'notification-abc' },
      } as never);

      const result = await createOrUpdateBannerNotificationAction(
        initialFormState,
        buildFormData(validPayload)
      );

      expect(result.success).toBe(true);
      expect(result.data?.notificationId).toBe('notification-abc');
      expect(revalidatePath).toHaveBeenCalledWith('/');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/notifications');
      expect(BannerNotificationService.upsertNotification).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          content: 'Hello world',
          textColor: '#ffffff',
          backgroundColor: '#000000',
          addedById: 'user-123',
        })
      );
    });

    it('should pass null for empty optional fields', async () => {
      vi.mocked(BannerNotificationService.upsertNotification).mockResolvedValue({
        success: true,
        data: { id: 'notification-abc' },
      } as never);

      const result = await createOrUpdateBannerNotificationAction(
        initialFormState,
        buildFormData(validPayload)
      );

      expect(result.success).toBe(true);
      expect(BannerNotificationService.upsertNotification).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          displayFrom: null,
          displayUntil: null,
          repostedFromId: null,
        })
      );
    });
  });

  describe('deleteBannerNotificationAction', () => {
    it('should return unauthorized when requireRole rejects', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await deleteBannerNotificationAction(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
      expect(BannerNotificationService.deleteNotification).not.toHaveBeenCalled();
    });

    it('should return error when service fails', async () => {
      vi.mocked(BannerNotificationService.deleteNotification).mockResolvedValue({
        success: false,
        error: 'Not found',
      } as never);

      const result = await deleteBannerNotificationAction(2);

      expect(result).toEqual({ success: false, error: 'Not found' });
    });

    it('should return success and revalidate paths', async () => {
      vi.mocked(BannerNotificationService.deleteNotification).mockResolvedValue({
        success: true,
      } as never);

      const result = await deleteBannerNotificationAction(3);

      expect(result).toEqual({ success: true });
      expect(BannerNotificationService.deleteNotification).toHaveBeenCalledWith(3);
      expect(revalidatePath).toHaveBeenCalledWith('/');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/notifications');
    });
  });

  describe('updateRotationIntervalAction', () => {
    it('should return unauthorized when requireRole rejects', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await updateRotationIntervalAction(5);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
      expect(BannerNotificationService.updateRotationInterval).not.toHaveBeenCalled();
    });

    it('should return error when interval is below minimum (3)', async () => {
      const result = await updateRotationIntervalAction(2);

      expect(result).toEqual({
        success: false,
        error: 'Invalid interval (must be 3-15)',
      });
      expect(BannerNotificationService.updateRotationInterval).not.toHaveBeenCalled();
    });

    it('should return error when interval is above maximum (15)', async () => {
      const result = await updateRotationIntervalAction(16);

      expect(result).toEqual({
        success: false,
        error: 'Invalid interval (must be 3-15)',
      });
      expect(BannerNotificationService.updateRotationInterval).not.toHaveBeenCalled();
    });

    it('should return error when service fails', async () => {
      vi.mocked(BannerNotificationService.updateRotationInterval).mockResolvedValue({
        success: false,
        error: 'Update failed',
      } as never);

      const result = await updateRotationIntervalAction(5);

      expect(result).toEqual({ success: false, error: 'Update failed' });
    });

    it('should return success and revalidate path', async () => {
      vi.mocked(BannerNotificationService.updateRotationInterval).mockResolvedValue({
        success: true,
      } as never);

      const result = await updateRotationIntervalAction(10);

      expect(result).toEqual({ success: true });
      expect(BannerNotificationService.updateRotationInterval).toHaveBeenCalledWith(10);
      expect(revalidatePath).toHaveBeenCalledWith('/');
    });
  });
});
