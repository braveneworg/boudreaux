/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { GroupService } from '../services/group-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { createGroupSchema } from '../validation/create-group-schema';

import type { FormState } from '../types/form-state';

export const updateGroupAction = async (
  groupId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');
  if (!session?.user?.id) {
    throw new Error('Invalid admin session: missing user id for audit logging.');
  }

  const permittedFieldNames = [
    'name',
    'displayName',
    'bio',
    'shortBio',
    'formedOn',
    'endedOn',
    'publishedOn',
  ];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, createGroupSchema);

  if (parsed.success) {
    try {
      const { name, displayName, bio, shortBio, formedOn, endedOn, publishedOn } = parsed.data;

      // Update group in database
      const response = await GroupService.updateGroup(groupId, {
        name,
        displayName,
        bio,
        shortBio,
        formedOn: formedOn ? new Date(formedOn) : undefined,
        endedOn: endedOn ? new Date(endedOn) : undefined,
        publishedOn: publishedOn ? new Date(publishedOn) : undefined,
      });

      // Log group update for security audit
      logSecurityEvent({
        event: 'media.group.updated',
        userId: session.user.id,
        metadata: {
          groupId,
          updatedFields: Object.keys(parsed.data).filter(
            (key) => parsed.data[key as keyof typeof parsed.data] !== undefined
          ),
          success: response.success,
        },
      });

      if (response.success) {
        formState.errors = undefined;
        formState.data = { groupId: response.data?.id };
      } else {
        if (!formState.errors) {
          formState.errors = {};
        }

        const errorMessage = response.error || 'Failed to update group';

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

      // Revalidate paths
      revalidatePath(`/admin/groups/${groupId}`);
      revalidatePath('/admin/groups');
    } catch {
      formState.success = false;
      setUnknownError(formState);
    }
  }

  return formState;
};
