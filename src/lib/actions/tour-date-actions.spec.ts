/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import {
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
} from './tour-date-actions';
import { TourDateRepository } from '../repositories/tours/tour-date-repository';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../repositories/tours/tour-date-repository');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');

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
