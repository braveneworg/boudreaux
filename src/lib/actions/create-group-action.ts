'use server';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { GroupService } from '../services/group-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { createGroupSchema } from '../validation/create-group-schema';

import type { FormState } from '../types/form-state';

export const createGroupAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

  const permittedFieldNames = ['name', 'displayName', 'bio', 'shortBio', 'formedOn', 'publishedOn'];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createGroupSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id && session?.user?.role !== 'admin') {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be a logged in admin user to create a group'];
        return formState;
      }

      const { name, displayName, bio, shortBio } = parsed.data;

      // Create group in database
      const response = await GroupService.createGroup({
        name,
        displayName,
        bio,
        shortBio,
      });

      // Log group creation for security audit
      logSecurityEvent({
        event: 'media.group.created',
        userId: session.user.id,
        metadata: {
          createdFields: Object.keys(parsed.data).filter(
            (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
          ),
          success: response.success,
        },
      });

      if (response.success) {
        formState.errors = undefined;
        // Include the created group ID in the response for image uploads
        formState.data = { groupId: response.data?.id };
      } else {
        if (!formState.errors) {
          formState.errors = {};
        }

        const errorMessage = response.error || 'Failed to create group';

        // Check if error is related to name uniqueness
        if (
          errorMessage.toLowerCase().includes('name') &&
          (errorMessage.toLowerCase().includes('unique') ||
            errorMessage.toLowerCase().includes('already exists') ||
            errorMessage.toLowerCase().includes('duplicate'))
        ) {
          formState.errors.name = ['This name is already in use. Please choose a different one.'];
        } else {
          formState.errors = { general: [errorMessage] };
        }
      }

      formState.success = response.success;

      // Revalidate the create group page to clear data
      revalidatePath('/admin/group/new');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
