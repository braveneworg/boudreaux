/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import {
  createTourDateAction,
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
  updateTourDateAction,
} from './tour-date-actions';
import { TourDateRepository } from '../repositories/tours/tour-date-repository';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../repositories/tours/tour-date-repository');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('../utils/auth/require-role');
vi.mock('@/lib/utils/auth/get-action-state');

describe('Tour Date Headliner Actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const validObjectId = '507f1f77bcf86cd799439011';
  const validObjectId2 = '507f1f77bcf86cd799439012';
  const validObjectId3 = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('updateHeadlinerSetTimeAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await updateHeadlinerSetTimeAction(validObjectId, '2026-03-08T20:00:00Z');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should validate headliner ID format', async () => {
      const result = await updateHeadlinerSetTimeAction('invalid-id', '2026-03-08T20:00:00Z');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid headliner ID');
    });

    it('should update set time and return success', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockResolvedValue(undefined);

      const setTime = '2026-03-08T20:00:00.000Z';
      const result = await updateHeadlinerSetTimeAction(validObjectId, setTime);

      expect(TourDateRepository.updateHeadlinerSetTime).toHaveBeenCalledWith(
        validObjectId,
        new Date(setTime)
      );
      expect(result.success).toBe(true);
    });

    it('should allow clearing set time with null', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockResolvedValue(undefined);

      const result = await updateHeadlinerSetTimeAction(validObjectId, null);

      expect(TourDateRepository.updateHeadlinerSetTime).toHaveBeenCalledWith(validObjectId, null);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', async () => {
      const result = await updateHeadlinerSetTimeAction(validObjectId, 'not-a-date');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid set time format');
    });

    it('should log security event on success', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockResolvedValue(undefined);

      const setTime = '2026-03-08T20:00:00.000Z';
      await updateHeadlinerSetTimeAction(validObjectId, setTime);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDateHeadliner.setTimeUpdated',
        userId: 'user-123',
        metadata: { headlinerId: validObjectId, setTime },
      });
    });

    it('should revalidate paths on success', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockResolvedValue(undefined);

      await updateHeadlinerSetTimeAction(validObjectId, '2026-03-08T20:00:00.000Z');

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
      expect(revalidatePath).toHaveBeenCalledWith('/tours');
    });

    it('should handle repository errors', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValue(
        new Error('Database error')
      );

      const result = await updateHeadlinerSetTimeAction(validObjectId, '2026-03-08T20:00:00.000Z');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update set time');
    });
  });

  describe('removeHeadlinerAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await removeHeadlinerAction(validObjectId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should validate headliner ID format', async () => {
      const result = await removeHeadlinerAction('invalid-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid headliner ID');
    });

    it('should remove headliner and return success', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockResolvedValue(undefined);

      const result = await removeHeadlinerAction(validObjectId);

      expect(TourDateRepository.removeHeadliner).toHaveBeenCalledWith(validObjectId);
      expect(result.success).toBe(true);
    });

    it('should log security event on success', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockResolvedValue(undefined);

      await removeHeadlinerAction(validObjectId);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDateHeadliner.removed',
        userId: 'user-123',
        metadata: { headlinerId: validObjectId },
      });
    });

    it('should revalidate paths on success', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockResolvedValue(undefined);

      await removeHeadlinerAction(validObjectId);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
      expect(revalidatePath).toHaveBeenCalledWith('/tours');
    });

    it('should handle repository errors', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValue(new Error('Database error'));

      const result = await removeHeadlinerAction(validObjectId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to remove headliner');
    });
  });

  describe('reorderHeadlinersAction', () => {
    const headlinerIds = [validObjectId, validObjectId2, validObjectId3];

    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should validate tour date ID format', async () => {
      const result = await reorderHeadlinersAction('invalid-id', headlinerIds);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tour date ID');
    });

    it('should validate all headliner IDs in the list', async () => {
      const result = await reorderHeadlinersAction(validObjectId, [validObjectId, 'invalid-id']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid headliner ID in list');
    });

    it('should reorder headliners and return success', async () => {
      vi.mocked(TourDateRepository.reorderHeadliners).mockResolvedValue(undefined);

      const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(TourDateRepository.reorderHeadliners).toHaveBeenCalledWith(
        validObjectId,
        headlinerIds
      );
      expect(result.success).toBe(true);
    });

    it('should log security event on success', async () => {
      vi.mocked(TourDateRepository.reorderHeadliners).mockResolvedValue(undefined);

      await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'tourDateHeadliner.reordered',
        userId: 'user-123',
        metadata: { tourDateId: validObjectId, headlinerIds },
      });
    });

    it('should revalidate paths on success', async () => {
      vi.mocked(TourDateRepository.reorderHeadliners).mockResolvedValue(undefined);

      await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
      expect(revalidatePath).toHaveBeenCalledWith('/tours');
    });

    it('should handle repository errors', async () => {
      vi.mocked(TourDateRepository.reorderHeadliners).mockRejectedValue(
        new Error('Database error')
      );

      const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to reorder headliners');
    });
  });
});

// ─── createTourDateAction ────────────────────────────────────────────────────

describe('createTourDateAction', () => {
  const mockSession = {
    user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
  };

  const initialFormState = { fields: {}, success: false };

  const mockFormData = new FormData();

  const validParsedData = {
    tourId: '507f1f77bcf86cd799439011',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    showStartTime: new Date('2026-06-01T20:00:00.000Z'),
    venueId: '507f1f77bcf86cd799439012',
    headlinerIds: ['507f1f77bcf86cd799439013'],
  };

  const mockTourDate = { id: '507f1f77bcf86cd799439099' };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
    vi.mocked(TourDateRepository.create).mockResolvedValue(mockTourDate as never);
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: { success: true, data: validParsedData },
    } as never);
  });

  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(createTourDateAction(initialFormState, mockFormData)).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('returns validation errors when parsed fails', async () => {
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: {
        success: false,
        error: { issues: [{ path: ['venueId'], message: 'Venue is required' }] },
      },
    } as never);

    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(result.errors?.venueId).toContain('Venue is required');
  });

  it('creates a tour date on success', async () => {
    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(TourDateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tourId: validParsedData.tourId,
        venueId: validParsedData.venueId,
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ tourDateId: mockTourDate.id });
  });

  it('passes timeZone through to the repository', async () => {
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: {
        success: true,
        data: { ...validParsedData, timeZone: 'America/Chicago' },
      },
    } as never);

    await createTourDateAction(initialFormState, mockFormData);

    expect(TourDateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: 'America/Chicago' })
    );
  });

  it('passes utcOffset through to the repository', async () => {
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: {
        success: true,
        data: { ...validParsedData, utcOffset: -300 },
      },
    } as never);

    await createTourDateAction(initialFormState, mockFormData);

    expect(TourDateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ utcOffset: -300 })
    );
  });

  it('logs a security event on success', async () => {
    await createTourDateAction(initialFormState, mockFormData);

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tourDate.created',
        userId: 'user-123',
        metadata: expect.objectContaining({ tourDateId: mockTourDate.id }),
      })
    );
  });

  it('revalidates relevant paths on success', async () => {
    await createTourDateAction(initialFormState, mockFormData);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
    expect(revalidatePath).toHaveBeenCalledWith('/tours');
  });

  it('handles repository errors', async () => {
    vi.mocked(TourDateRepository.create).mockRejectedValue(new Error('Database error'));

    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(setUnknownError).toHaveBeenCalled();
  });
});

// ─── updateTourDateAction ────────────────────────────────────────────────────

describe('updateTourDateAction', () => {
  const mockSession = {
    user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
  };

  const tourDateId = '507f1f77bcf86cd799439099';
  const initialFormState = { fields: {}, success: false };
  const mockFormData = new FormData();

  const validParsedData = {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    venueId: '507f1f77bcf86cd799439012',
  };

  const mockTourDate = { id: tourDateId };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
    vi.mocked(TourDateRepository.update).mockResolvedValue(mockTourDate as never);
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: { success: true, data: validParsedData },
    } as never);
  });

  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(
      updateTourDateAction(tourDateId, initialFormState, mockFormData)
    ).rejects.toThrow();
  });

  it('returns validation errors when parsed fails', async () => {
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: {
        success: false,
        error: {
          issues: [{ path: ['showStartTime'], message: 'Invalid date' }],
        },
      },
    } as never);

    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(result.errors?.showStartTime).toContain('Invalid date');
  });

  it('updates tour date on success', async () => {
    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(TourDateRepository.update).toHaveBeenCalledWith(
      tourDateId,
      expect.objectContaining(validParsedData)
    );
    expect(result.success).toBe(true);
  });

  it('passes timeZone update through to the repository', async () => {
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: {
        success: true,
        data: { ...validParsedData, timeZone: 'Europe/London' },
      },
    } as never);

    await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(TourDateRepository.update).toHaveBeenCalledWith(
      tourDateId,
      expect.objectContaining({ timeZone: 'Europe/London' })
    );
  });

  it('passes utcOffset update through to the repository', async () => {
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: {
        success: true,
        data: { ...validParsedData, utcOffset: 60 },
      },
    } as never);

    await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(TourDateRepository.update).toHaveBeenCalledWith(
      tourDateId,
      expect.objectContaining({ utcOffset: 60 })
    );
  });

  it('logs a security event on success', async () => {
    await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tourDate.updated',
        userId: 'user-123',
        metadata: expect.objectContaining({ tourDateId }),
      })
    );
  });

  it('revalidates relevant paths on success', async () => {
    await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
    expect(revalidatePath).toHaveBeenCalledWith('/tours');
  });

  it('handles repository errors', async () => {
    vi.mocked(TourDateRepository.update).mockRejectedValue(new Error('Database error'));

    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(setUnknownError).toHaveBeenCalled();
  });
});
