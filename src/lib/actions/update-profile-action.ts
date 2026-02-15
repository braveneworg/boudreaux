/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import profileSchema from '@/lib/validation/profile-schema';

import { auth } from '../../../auth';

import type { FormState } from '../types/form-state';

export const updateProfileAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const permittedFieldNames = [
    'firstName',
    'lastName',
    'phone',
    'addressLine1',
    'addressLine2',
    'city',
    'state',
    'zipCode',
    'country',
    'allowSmsNotifications',
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, profileSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id) {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be logged in to update your profile'];
        return formState;
      }

      const {
        firstName,
        lastName,
        phone,
        addressLine1,
        addressLine2,
        city,
        state,
        zipCode,
        country,
        allowSmsNotifications,
      } = parsed.data;
      // Combine first and last name into the 'name' field for backward compatibility
      const fullName = `${firstName} ${lastName}`.trim();

      // Update user in database
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          name: fullName,
          firstName,
          lastName,
          phone,
          addressLine1,
          addressLine2,
          city,
          state,
          zipCode,
          country,
          allowSmsNotifications,
        },
      });

      // Log profile update for security audit
      logSecurityEvent({
        event: 'user.profile.updated',
        userId: session.user.id,
        metadata: {
          updatedFields: Object.keys(parsed.data).filter(
            (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
          ),
        },
      });

      formState.success = true;

      // Revalidate the profile page to show updated data
      revalidatePath('/profile');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
