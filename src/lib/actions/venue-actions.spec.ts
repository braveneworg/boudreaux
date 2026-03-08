/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';

import { createVenueAction } from './venue-actions';
import { VenueService } from '../services/tours/venue-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { requireRole } from '../utils/auth/require-role';

import type { FormState } from '../types/form-state';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../services/tours/venue-service');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('../utils/auth/require-role');

describe('Venue Actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  describe('createVenueAction', () => {
    const mockFormData = new FormData();
    mockFormData.append('name', 'The Fillmore');
    mockFormData.append('city', 'San Francisco');
    mockFormData.append('state', 'CA');
    mockFormData.append('address', '1805 Geary Blvd');

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
            name: 'The Fillmore',
            city: 'San Francisco',
            state: 'CA',
            address: '1805 Geary Blvd',
          },
        },
      } as never);

      vi.mocked(VenueService.create).mockResolvedValue({
        id: 'venue-123',
        name: 'The Fillmore',
        city: 'San Francisco',
      } as never);
    });

    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      await expect(createVenueAction(initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('should validate input and create venue', async () => {
      const result = await createVenueAction(initialFormState, mockFormData);

      expect(VenueService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'The Fillmore',
          city: 'San Francisco',
          createdBy: 'user-123',
        })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ venueId: 'venue-123' });
    });

    it('should check for duplicate venues before creation', async () => {
      vi.mocked(VenueService.checkDuplicateName).mockResolvedValue(true);

      const result = await createVenueAction(initialFormState, mockFormData);

      expect(VenueService.checkDuplicateName).toHaveBeenCalledWith('The Fillmore', 'San Francisco');
      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain(
        'A venue with this name already exists in San Francisco'
      );
    });

    it('should log security event on successful creation', async () => {
      vi.mocked(VenueService.checkDuplicateName).mockResolvedValue(false);

      await createVenueAction(initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'venue.created',
        userId: 'user-123',
        metadata: expect.objectContaining({
          venueId: 'venue-123',
          name: 'The Fillmore',
          city: 'San Francisco',
        }),
      });
    });

    it('should revalidate relevant paths after creation', async () => {
      vi.mocked(VenueService.checkDuplicateName).mockResolvedValue(false);

      await createVenueAction(initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours/new');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/tours');
    });

    it('should handle validation errors', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: {
          fields: {},
          success: false,
          errors: {
            name: ['Name is required'],
          },
        },
        parsed: {
          success: false,
          error: {
            issues: [
              {
                path: ['name'],
                message: 'Name is required',
              },
            ],
          },
        },
      } as never);

      const result = await createVenueAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.name).toEqual(['Name is required']);
    });

    it('should handle service errors', async () => {
      vi.mocked(VenueService.checkDuplicateName).mockResolvedValue(false);
      vi.mocked(VenueService.create).mockRejectedValue(new Error('Database error'));

      const result = await createVenueAction(initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(setUnknownError).toHaveBeenCalled();
    });
  });
});
