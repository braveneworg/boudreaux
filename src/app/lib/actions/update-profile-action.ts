'use server';

import { auth } from '../../../../auth';
import getActionState from '@/app/lib/utils/auth/get-action-state';
import { setUnknownError } from '@/app/lib/utils/auth/auth-utils';
import profileSchema from '@/app/lib/validation/profile-schema';
import type { FormState } from '../types/form-state';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export const updateProfileAction = async (_initialState: FormState, payload: FormData): Promise<FormState> => {
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

      // Extract first and last name from the parsed data
      const { firstName, lastName } = parsed.data;

      // Combine first and last name into the 'name' field for backward compatibility
      const fullName = `${firstName} ${lastName}`.trim();

      // Update user in database
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          name: fullName,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: parsed.data.phone,
          addressLine1: parsed.data.addressLine1,
          addressLine2: parsed.data.addressLine2,
          city: parsed.data.city,
          state: parsed.data.state,
          zipCode: parsed.data.zipCode,
          country: parsed.data.country,
          allowSmsNotifications: parsed.data.allowSmsNotifications,
        },
      });

      formState.success = true;

      // Revalidate the profile page to show updated data
      revalidatePath('/profile');

    } catch (error: unknown) {
      formState.success = false;

      // Handle specific database errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error('Database error:', error);
        setUnknownError(formState);
      } else {
        console.error('Unknown error:', error);
        setUnknownError(formState);
      }
    }
  }

  return formState;
};