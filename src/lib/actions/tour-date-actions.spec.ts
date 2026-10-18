/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { DataError } from '@/lib/types/domain/errors';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';

import {
  createTourDateAction,
  deleteTourDateAction,
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
  updateTourDateAction,
} from './tour-date-actions';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../repositories/tours/tour-date-repository');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/auth/get-action-state');

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const REFUSED_FORM = { fields: {}, success: false, errors: { general: ['Unauthorized'] } };

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
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('updateHeadlinerSetTimeAction', () => {
    it('returns the gate refusal without touching the repository', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await updateHeadlinerSetTimeAction(validObjectId, '2026-03-08T20:00:00Z');

      expect(result).toEqual(REFUSAL);
      expect(TourDateRepository.updateHeadlinerSetTime).not.toHaveBeenCalled();
    });

    it('should validate headliner ID format', async () => {
      const result = await updateHeadlinerSetTimeAction('invalid-id', '2026-03-08T20:00:00Z');

      expect(result).toEqual({
        success: false,
        error: 'Invalid headliner ID',
        code: 'INVALID_INPUT',
      });
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

      expect(result).toEqual({
        success: false,
        error: 'Invalid set time format',
        code: 'INVALID_INPUT',
      });
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
      expect(revalidatePath).toHaveBeenCalledWith('/tours/[tourId]', 'page');
    });

    it('should handle repository errors', async () => {
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValue(
        new Error('Database error')
      );

      const result = await updateHeadlinerSetTimeAction(validObjectId, '2026-03-08T20:00:00.000Z');

      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });

    it('falls back to tourDate+artist lookup when the repository reports NOT_FOUND and IDs are valid', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValue(notFound);
      vi.mocked(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).mockResolvedValue(
        true as never
      );

      const setTime = '2026-03-08T20:00:00.000Z';
      const result = await updateHeadlinerSetTimeAction(
        validObjectId,
        setTime,
        validObjectId2,
        validObjectId3
      );

      expect(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).toHaveBeenCalledWith(
        validObjectId2,
        validObjectId3,
        new Date(setTime)
      );
      expect(logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ fallback: true }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('returns failure when the NOT_FOUND fallback finds no record', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValue(notFound);
      vi.mocked(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).mockResolvedValue(
        false as never
      );

      const result = await updateHeadlinerSetTimeAction(
        validObjectId,
        '2026-03-08T20:00:00.000Z',
        validObjectId2,
        validObjectId3
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });

    it('returns failure when the NOT_FOUND fallback itself throws', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValue(notFound);
      vi.mocked(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).mockRejectedValue(
        new Error('fallback exploded')
      );

      const result = await updateHeadlinerSetTimeAction(
        validObjectId,
        '2026-03-08T20:00:00.000Z',
        validObjectId2,
        validObjectId3
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });

    it('does not attempt fallback when NOT_FOUND fires but tourDateId/artistId are invalid', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.updateHeadlinerSetTime).mockRejectedValue(notFound);

      const result = await updateHeadlinerSetTimeAction(
        validObjectId,
        '2026-03-08T20:00:00.000Z',
        'invalid-id',
        validObjectId3
      );

      expect(TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Failed to update set time',
        code: 'UNKNOWN',
      });
    });
  });

  describe('removeHeadlinerAction', () => {
    it('returns the gate refusal without touching the repository', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await removeHeadlinerAction(validObjectId);

      expect(result).toEqual(REFUSAL);
      expect(TourDateRepository.removeHeadliner).not.toHaveBeenCalled();
    });

    it('should validate headliner ID format', async () => {
      const result = await removeHeadlinerAction('invalid-id');

      expect(result).toEqual({
        success: false,
        error: 'Invalid headliner ID',
        code: 'INVALID_INPUT',
      });
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
      expect(revalidatePath).toHaveBeenCalledWith('/tours/[tourId]', 'page');
    });

    it('should handle repository errors', async () => {
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValue(new Error('Database error'));

      const result = await removeHeadlinerAction(validObjectId);

      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });

    it('falls back to tourDate+artist removal when the repository reports NOT_FOUND and IDs are valid', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValue(notFound);
      vi.mocked(TourDateRepository.removeHeadlinerByTourDateAndArtist).mockResolvedValue(
        true as never
      );

      const result = await removeHeadlinerAction(validObjectId, validObjectId2, validObjectId3);

      expect(TourDateRepository.removeHeadlinerByTourDateAndArtist).toHaveBeenCalledWith(
        validObjectId2,
        validObjectId3
      );
      expect(logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ fallback: true }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('returns failure when the NOT_FOUND fallback finds no record', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValue(notFound);
      vi.mocked(TourDateRepository.removeHeadlinerByTourDateAndArtist).mockResolvedValue(
        false as never
      );

      const result = await removeHeadlinerAction(validObjectId, validObjectId2, validObjectId3);

      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });

    it('returns failure when the NOT_FOUND fallback itself throws', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValue(notFound);
      vi.mocked(TourDateRepository.removeHeadlinerByTourDateAndArtist).mockRejectedValue(
        new Error('fallback exploded')
      );

      const result = await removeHeadlinerAction(validObjectId, validObjectId2, validObjectId3);

      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });

    it('does not attempt fallback when NOT_FOUND fires but tourDateId/artistId are invalid', async () => {
      const notFound = new DataError('NOT_FOUND', 'Not found');
      vi.mocked(TourDateRepository.removeHeadliner).mockRejectedValue(notFound);

      const result = await removeHeadlinerAction(validObjectId, 'invalid-id', validObjectId3);

      expect(TourDateRepository.removeHeadlinerByTourDateAndArtist).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Failed to remove headliner',
        code: 'UNKNOWN',
      });
    });
  });

  describe('reorderHeadlinersAction', () => {
    const headlinerIds = [validObjectId, validObjectId2, validObjectId3];

    it('returns the gate refusal without touching the repository', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(result).toEqual(REFUSAL);
      expect(TourDateRepository.reorderHeadliners).not.toHaveBeenCalled();
    });

    it('should validate tour date ID format', async () => {
      const result = await reorderHeadlinersAction('invalid-id', headlinerIds);

      expect(result).toEqual({
        success: false,
        error: 'Invalid tour date ID',
        code: 'INVALID_INPUT',
      });
    });

    it('should validate all headliner IDs in the list', async () => {
      const result = await reorderHeadlinersAction(validObjectId, [validObjectId, 'invalid-id']);

      expect(result).toEqual({
        success: false,
        error: 'Invalid headliner ID in list',
        code: 'INVALID_INPUT',
      });
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
      expect(revalidatePath).toHaveBeenCalledWith('/tours/[tourId]', 'page');
    });

    it('should handle repository errors', async () => {
      vi.mocked(TourDateRepository.reorderHeadliners).mockRejectedValue(
        new Error('Database error')
      );

      const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

      expect(result).toEqual({
        success: false,
        error: 'Failed to reorder headliners',
        code: 'UNKNOWN',
      });
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
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
    vi.mocked(revalidatePath).mockImplementation(() => {});
    vi.mocked(TourDateRepository.create).mockResolvedValue(mockTourDate as never);
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: { success: true, data: validParsedData },
    } as never);
  });

  it('resolves the gate refusal as a form error without creating a tour date', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(result).toEqual(REFUSED_FORM);
    expect(TourDateRepository.create).not.toHaveBeenCalled();
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
    expect(revalidatePath).toHaveBeenCalledWith('/tours/[tourId]', 'page');
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
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
    vi.mocked(revalidatePath).mockImplementation(() => {});
    vi.mocked(TourDateRepository.update).mockResolvedValue(mockTourDate as never);
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: { success: true, data: validParsedData },
    } as never);
  });

  it('resolves the gate refusal as a form error without updating the tour date', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(result).toEqual(REFUSED_FORM);
    expect(TourDateRepository.update).not.toHaveBeenCalled();
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
    expect(revalidatePath).toHaveBeenCalledWith('/tours/[tourId]', 'page');
  });

  it('handles repository errors', async () => {
    vi.mocked(TourDateRepository.update).mockRejectedValue(new Error('Database error'));

    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(setUnknownError).toHaveBeenCalled();
  });
});

// ─── deleteTourDateAction ────────────────────────────────────────────────────

describe('deleteTourDateAction', () => {
  const mockSession = {
    user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
  };

  const validTourDateId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
    vi.mocked(revalidatePath).mockImplementation(() => {});
    vi.mocked(TourDateRepository.delete).mockResolvedValue(undefined as never);
  });

  it('returns the gate refusal without touching the repository', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await deleteTourDateAction(validTourDateId);

    expect(result).toEqual(REFUSAL);
    expect(TourDateRepository.delete).not.toHaveBeenCalled();
  });

  it('returns error for invalid tour date ID format', async () => {
    const result = await deleteTourDateAction('not-a-valid-object-id');

    expect(result).toEqual({
      success: false,
      error: 'Invalid tour date ID',
      code: 'INVALID_INPUT',
    });
  });

  it('deletes the tour date and returns success', async () => {
    const result = await deleteTourDateAction(validTourDateId);

    expect(TourDateRepository.delete).toHaveBeenCalledWith(validTourDateId);
    expect(result.success).toBe(true);
  });

  it('logs a security event on successful deletion', async () => {
    await deleteTourDateAction(validTourDateId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'tourDate.deleted',
      userId: 'user-123',
      metadata: { tourDateId: validTourDateId },
    });
  });

  it('revalidates relevant paths on success', async () => {
    await deleteTourDateAction(validTourDateId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
    expect(revalidatePath).toHaveBeenCalledWith('/tours');
    expect(revalidatePath).toHaveBeenCalledWith('/tours/[tourId]', 'page');
  });

  it('handles repository errors gracefully', async () => {
    vi.mocked(TourDateRepository.delete).mockRejectedValue(new Error('DB error'));

    const result = await deleteTourDateAction(validTourDateId);

    expect(result).toEqual({
      success: false,
      error: 'Failed to delete tour date',
      code: 'UNKNOWN',
    });
  });
});
