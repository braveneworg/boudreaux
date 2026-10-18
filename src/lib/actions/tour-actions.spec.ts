/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { TourService } from '@/lib/services/tours/tour-service';
import type { FormState } from '@/lib/types/form-state';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

import { createTourAction, deleteTourAction, updateTourAction } from './tour-actions';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../services/tours/tour-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('@/lib/auth/action-gate');

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

describe('Tour Actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('createTourAction', () => {
    const mockFormData = new FormData();
    mockFormData.append('title', 'Summer Tour 2026');

    const initialFormState: FormState = {
      fields: {},
      success: false,
    };

    beforeEach(() => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Summer Tour 2026',
          },
        },
      } as never);

      vi.mocked(TourService.create).mockResolvedValue({
        id: 'tour-123',
        title: 'Summer Tour 2026',
      } as never);
    });

    it('resolves the gate refusal as a form error without creating a tour', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await createTourAction(initialFormState, mockFormData);

      expect(result).toEqual({ fields: {}, success: false, errors: { general: ['Unauthorized'] } });
      expect(TourService.create).not.toHaveBeenCalled();
    });

    it('should validate input and create tour', async () => {
      const result = await createTourAction(initialFormState, mockFormData);

      expect(TourService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Summer Tour 2026',
        })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ tourId: 'tour-123' });
    });

    it('should log security event on successful creation', async () => {
      await createTourAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tour.created',
        userId: 'user-123',
        metadata: expect.objectContaining({
          tourId: 'tour-123',
          title: 'Summer Tour 2026',
        }),
      });
    });

    it('should revalidate relevant paths after creation', async () => {
      await createTourAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
      expect(revalidatePath).toHaveBeenCalledWith('/tours');
    });

    it('should handle validation errors', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: {
          fields: {},
          success: false,
          errors: {},
        },
        parsed: {
          success: false,
          error: {
            issues: [
              {
                path: ['title'],
                message: 'Title is required',
              },
            ],
          },
        },
      } as never);

      const result = await createTourAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual(['Title is required']);
    });

    it('should handle service errors', async () => {
      vi.mocked(TourService.create).mockRejectedValue(new Error('Database error'));

      const result = await createTourAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalled();
    });

    it('should append multiple errors to the same field', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: {
          fields: {},
          success: false,
          errors: {},
        },
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['title'], message: 'Title is required' },
              { path: ['title'], message: 'Title must be at least 3 characters' },
            ],
          },
        },
      } as never);

      const result = await createTourAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'Title is required',
        'Title must be at least 3 characters',
      ]);
    });
  });

  describe('updateTourAction', () => {
    const tourId = 'tour-123';
    const mockFormData = new FormData();
    mockFormData.append('title', 'Updated Tour Title');

    const initialFormState: FormState = {
      fields: {},
      success: false,
    };

    beforeEach(() => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: true,
          data: {
            title: 'Updated Tour Title',
          },
        },
      } as never);

      vi.mocked(TourService.update).mockResolvedValue({
        id: tourId,
        title: 'Updated Tour Title',
        displayHeadliners: ['Artist One'],
      } as never);
    });

    it('resolves the gate refusal as a form error without updating the tour', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await updateTourAction(tourId, initialFormState, mockFormData);

      expect(result).toEqual({ fields: {}, success: false, errors: { general: ['Unauthorized'] } });
      expect(TourService.update).not.toHaveBeenCalled();
    });

    it('should validate input and update tour', async () => {
      const result = await updateTourAction(tourId, initialFormState, mockFormData);

      expect(TourService.update).toHaveBeenCalledWith(
        tourId,
        expect.objectContaining({ title: 'Updated Tour Title' }),
        'user-123'
      );
      expect(result.success).toBe(true);
    });

    it('should log security event on successful update', async () => {
      await updateTourAction(tourId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tour.updated',
        userId: 'user-123',
        metadata: expect.objectContaining({
          tourId,
        }),
      });
    });

    it('should revalidate relevant paths after update', async () => {
      await updateTourAction(tourId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
      expect(revalidatePath).toHaveBeenCalledWith('/tours');
      expect(revalidatePath).toHaveBeenCalledWith(`/tours/${tourId}`);
    });

    it('should handle validation errors', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: {
          fields: {},
          success: false,
          errors: {},
        },
        parsed: {
          success: false,
          error: {
            issues: [
              {
                path: ['title'],
                message: 'Title is too long',
              },
            ],
          },
        },
      } as never);

      const result = await updateTourAction(tourId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual(['Title is too long']);
    });

    it('should handle service errors', async () => {
      vi.mocked(TourService.update).mockRejectedValue(new Error('Database error'));

      const result = await updateTourAction(tourId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalled();
    });

    it('should append multiple errors to the same field', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: {
          fields: {},
          success: false,
          errors: {},
        },
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['title'], message: 'Title is too long' },
              { path: ['title'], message: 'Title contains invalid characters' },
            ],
          },
        },
      } as never);

      const result = await updateTourAction(tourId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'Title is too long',
        'Title contains invalid characters',
      ]);
    });
  });

  describe('deleteTourAction', () => {
    const tourId = '507f1f77bcf86cd799439011'; // Valid MongoDB ObjectId format

    beforeEach(() => {
      vi.mocked(TourService.delete).mockResolvedValue({
        id: tourId,
        title: 'Deleted Tour',
        subtitle: null,
        subtitle2: null,
        description: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      } as never);
    });

    it('returns the gate refusal without deleting the tour', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await deleteTourAction(tourId);

      expect(result).toEqual(REFUSAL);
      expect(TourService.delete).not.toHaveBeenCalled();
    });

    it('should validate tour ID format', async () => {
      const result = await deleteTourAction('invalid-id');

      expect(result).toEqual({ success: false, error: 'Invalid tour ID', code: 'INVALID_INPUT' });
    });

    it('should delete tour and return success', async () => {
      const result = await deleteTourAction(tourId);

      expect(TourService.delete).toHaveBeenCalledWith(tourId);
      expect(result.success).toBe(true);
    });

    it('should log security event on successful deletion', async () => {
      await deleteTourAction(tourId);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tour.deleted',
        userId: 'user-123',
        metadata: { tourId },
      });
    });

    it('should revalidate paths after deletion', async () => {
      await deleteTourAction(tourId);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
      expect(revalidatePath).toHaveBeenCalledWith('/tours');
    });

    it('should handle service errors', async () => {
      vi.mocked(TourService.delete).mockRejectedValue(new Error('Database error'));

      const result = await deleteTourAction(tourId);

      expect(result).toEqual({ success: false, error: 'Failed to delete tour', code: 'UNKNOWN' });
    });
  });
});
