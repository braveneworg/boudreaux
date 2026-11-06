/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { TourDateService } from '@/lib/services/tours/tour-date-service';
import { getActionState } from '@/lib/utils/auth/get-action-state';
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
vi.mock('@/lib/services/tours/tour-date-service');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/auth/get-action-state');

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const REFUSED_FORM = { fields: {}, success: false, errors: { general: ['Unauthorized'] } };
const SESSION = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const SUCCEEDED = { success: true as const, data: undefined };

const validObjectId = '507f1f77bcf86cd799439011';
const validObjectId2 = '507f1f77bcf86cd799439012';
const validObjectId3 = '507f1f77bcf86cd799439013';

const TOUR_PATHS = [['/admin/tours'], ['/tours'], ['/tours/[tourId]', 'page']];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: SESSION as never });
});

describe('updateHeadlinerSetTimeAction', () => {
  const setTime = '2026-03-08T20:00:00.000Z';

  beforeEach(() => {
    vi.mocked(TourDateService.updateHeadlinerSetTime).mockResolvedValue(SUCCEEDED);
  });

  it('returns the gate refusal without reaching the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await updateHeadlinerSetTimeAction(validObjectId, setTime);

    expect(result).toEqual(REFUSAL);
    expect(TourDateService.updateHeadlinerSetTime).not.toHaveBeenCalled();
  });

  it('should validate headliner ID format', async () => {
    const result = await updateHeadlinerSetTimeAction('invalid-id', setTime);

    expect(result).toEqual({
      success: false,
      error: 'Invalid headliner ID',
      code: 'INVALID_INPUT',
    });
    expect(TourDateService.updateHeadlinerSetTime).not.toHaveBeenCalled();
  });

  it('should reject invalid date format', async () => {
    const result = await updateHeadlinerSetTimeAction(validObjectId, 'not-a-date');

    expect(result).toEqual({
      success: false,
      error: 'Invalid set time format',
      code: 'INVALID_INPUT',
    });
    expect(TourDateService.updateHeadlinerSetTime).not.toHaveBeenCalled();
  });

  it('hands the headliner, the retry ids and the admin to the service', async () => {
    const result = await updateHeadlinerSetTimeAction(
      validObjectId,
      setTime,
      validObjectId2,
      validObjectId3
    );

    expect(vi.mocked(TourDateService.updateHeadlinerSetTime).mock.calls).toEqual([
      [
        {
          headlinerId: validObjectId,
          setTime,
          tourDateId: validObjectId2,
          artistId: validObjectId3,
        },
        'user-123',
      ],
    ]);
    expect(result).toEqual({ success: true });
  });

  it('should allow clearing set time with null', async () => {
    await updateHeadlinerSetTimeAction(validObjectId, null);

    expect(TourDateService.updateHeadlinerSetTime).toHaveBeenCalledWith(
      expect.objectContaining({ headlinerId: validObjectId, setTime: null }),
      'user-123'
    );
  });

  it('should revalidate paths on success', async () => {
    await updateHeadlinerSetTimeAction(validObjectId, setTime);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual(TOUR_PATHS);
  });

  it('hands a service failure back without revalidating', async () => {
    const failure = {
      success: false as const,
      error: 'Failed to update set time',
      code: 'UNKNOWN' as const,
    };
    vi.mocked(TourDateService.updateHeadlinerSetTime).mockResolvedValueOnce(failure);

    const result = await updateHeadlinerSetTimeAction(validObjectId, setTime);

    expect(result).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('removeHeadlinerAction', () => {
  beforeEach(() => {
    vi.mocked(TourDateService.removeHeadliner).mockResolvedValue(SUCCEEDED);
  });

  it('returns the gate refusal without reaching the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await removeHeadlinerAction(validObjectId);

    expect(result).toEqual(REFUSAL);
    expect(TourDateService.removeHeadliner).not.toHaveBeenCalled();
  });

  it('should validate headliner ID format', async () => {
    const result = await removeHeadlinerAction('invalid-id');

    expect(result).toEqual({
      success: false,
      error: 'Invalid headliner ID',
      code: 'INVALID_INPUT',
    });
    expect(TourDateService.removeHeadliner).not.toHaveBeenCalled();
  });

  it('hands the headliner, the retry ids and the admin to the service', async () => {
    const result = await removeHeadlinerAction(validObjectId, validObjectId2, validObjectId3);

    expect(vi.mocked(TourDateService.removeHeadliner).mock.calls).toEqual([
      [
        { headlinerId: validObjectId, tourDateId: validObjectId2, artistId: validObjectId3 },
        'user-123',
      ],
    ]);
    expect(result).toEqual({ success: true });
  });

  it('should revalidate paths on success', async () => {
    await removeHeadlinerAction(validObjectId);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual(TOUR_PATHS);
  });

  it('hands a service failure back without revalidating', async () => {
    const failure = {
      success: false as const,
      error: 'Failed to remove headliner',
      code: 'UNKNOWN' as const,
    };
    vi.mocked(TourDateService.removeHeadliner).mockResolvedValueOnce(failure);

    const result = await removeHeadlinerAction(validObjectId);

    expect(result).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('reorderHeadlinersAction', () => {
  const headlinerIds = [validObjectId, validObjectId2, validObjectId3];

  beforeEach(() => {
    vi.mocked(TourDateService.reorderHeadliners).mockResolvedValue(SUCCEEDED);
  });

  it('returns the gate refusal without reaching the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

    expect(result).toEqual(REFUSAL);
    expect(TourDateService.reorderHeadliners).not.toHaveBeenCalled();
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
    expect(TourDateService.reorderHeadliners).not.toHaveBeenCalled();
  });

  it('should reorder headliners through the service', async () => {
    const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

    expect(vi.mocked(TourDateService.reorderHeadliners).mock.calls).toEqual([
      [validObjectId, headlinerIds, 'user-123'],
    ]);
    expect(result).toEqual({ success: true });
  });

  it('should revalidate paths on success', async () => {
    await reorderHeadlinersAction(validObjectId, headlinerIds);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual(TOUR_PATHS);
  });

  it('hands a service failure back', async () => {
    const failure = {
      success: false as const,
      error: 'Failed to reorder headliners',
      code: 'UNKNOWN' as const,
    };
    vi.mocked(TourDateService.reorderHeadliners).mockResolvedValueOnce(failure);

    const result = await reorderHeadlinersAction(validObjectId, headlinerIds);

    expect(result).toEqual(failure);
  });
});

// ─── createTourDateAction ────────────────────────────────────────────────────

describe('createTourDateAction', () => {
  const initialFormState = { fields: {}, success: false };
  const mockFormData = new FormData();

  const validParsedData = {
    tourId: '507f1f77bcf86cd799439011',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    showStartTime: new Date('2026-06-01T20:00:00.000Z'),
    venueId: '507f1f77bcf86cd799439012',
    headlinerIds: ['507f1f77bcf86cd799439013'],
    timeZone: 'America/Chicago',
    utcOffset: -300,
  };

  const newTourDateId = '507f1f77bcf86cd799439099';

  beforeEach(() => {
    vi.mocked(TourDateService.create).mockResolvedValue({
      success: true,
      data: { id: newTourDateId },
    });
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: { success: true, data: validParsedData },
    } as never);
  });

  it('resolves the gate refusal as a form error without creating a tour date', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(result).toEqual(REFUSED_FORM);
    expect(TourDateService.create).not.toHaveBeenCalled();
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
    expect(TourDateService.create).not.toHaveBeenCalled();
  });

  it('creates the tour date from every parsed field, as the admin', async () => {
    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(vi.mocked(TourDateService.create).mock.calls).toEqual([[validParsedData, 'user-123']]);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ tourDateId: newTourDateId });
  });

  it('revalidates relevant paths on success', async () => {
    await createTourDateAction(initialFormState, mockFormData);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual(TOUR_PATHS);
  });

  it('sets the unknown error when the service fails', async () => {
    vi.mocked(TourDateService.create).mockResolvedValueOnce({
      success: false,
      error: 'Failed to create tour date',
      code: 'UNKNOWN',
    });

    const result = await createTourDateAction(initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(setUnknownError).toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ─── updateTourDateAction ────────────────────────────────────────────────────

describe('updateTourDateAction', () => {
  const tourDateId = '507f1f77bcf86cd799439099';
  const initialFormState = { fields: {}, success: false };
  const mockFormData = new FormData();

  const validParsedData = {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    venueId: '507f1f77bcf86cd799439012',
    timeZone: 'Europe/London',
    utcOffset: 60,
  };

  beforeEach(() => {
    vi.mocked(TourDateService.update).mockResolvedValue(SUCCEEDED);
    vi.mocked(getActionState).mockReturnValue({
      formState: { fields: {}, success: false, errors: {} },
      parsed: { success: true, data: validParsedData },
    } as never);
  });

  it('resolves the gate refusal as a form error without updating the tour date', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(result).toEqual(REFUSED_FORM);
    expect(TourDateService.update).not.toHaveBeenCalled();
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
    expect(TourDateService.update).not.toHaveBeenCalled();
  });

  it('updates the tour date from every parsed field, as the admin', async () => {
    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(vi.mocked(TourDateService.update).mock.calls).toEqual([
      [tourDateId, validParsedData, 'user-123'],
    ]);
    expect(result.success).toBe(true);
  });

  it('revalidates relevant paths on success', async () => {
    await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual(TOUR_PATHS);
  });

  it('sets the unknown error when the service fails', async () => {
    vi.mocked(TourDateService.update).mockResolvedValueOnce({
      success: false,
      error: 'Failed to update tour date',
      code: 'UNKNOWN',
    });

    const result = await updateTourDateAction(tourDateId, initialFormState, mockFormData);

    expect(result.success).toBe(false);
    expect(setUnknownError).toHaveBeenCalled();
  });
});

// ─── deleteTourDateAction ────────────────────────────────────────────────────

describe('deleteTourDateAction', () => {
  const validTourDateId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    vi.mocked(TourDateService.delete).mockResolvedValue(SUCCEEDED);
  });

  it('returns the gate refusal without reaching the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await deleteTourDateAction(validTourDateId);

    expect(result).toEqual(REFUSAL);
    expect(TourDateService.delete).not.toHaveBeenCalled();
  });

  it('returns error for invalid tour date ID format', async () => {
    const result = await deleteTourDateAction('not-a-valid-object-id');

    expect(result).toEqual({
      success: false,
      error: 'Invalid tour date ID',
      code: 'INVALID_INPUT',
    });
    expect(TourDateService.delete).not.toHaveBeenCalled();
  });

  it('deletes the tour date through the service, as the admin', async () => {
    const result = await deleteTourDateAction(validTourDateId);

    expect(vi.mocked(TourDateService.delete).mock.calls).toEqual([[validTourDateId, 'user-123']]);
    expect(result).toEqual({ success: true });
  });

  it('revalidates relevant paths on success', async () => {
    await deleteTourDateAction(validTourDateId);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual(TOUR_PATHS);
  });

  it('hands a service failure back without revalidating', async () => {
    const failure = {
      success: false as const,
      error: 'Failed to delete tour date',
      code: 'UNKNOWN' as const,
    };
    vi.mocked(TourDateService.delete).mockResolvedValueOnce(failure);

    const result = await deleteTourDateAction(validTourDateId);

    expect(result).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
