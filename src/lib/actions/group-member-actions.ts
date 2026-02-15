/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { auth } from '../../../auth';
import { GroupService } from '../services/group-service';
import { logSecurityEvent } from '../utils/audit-log';
import { error as logError } from '../utils/console-logger';

export interface GroupMemberActionResult {
  success: boolean;
  error?: string;
  data?: {
    id: string;
    artistId: string;
    groupId: string;
  };
}

export interface RemoveGroupMemberResult {
  success: boolean;
  error?: string;
}

/**
 * Add an artist to a group
 */
export const addGroupMemberAction = async (
  groupId: string,
  artistId: string
): Promise<GroupMemberActionResult> => {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to add group members' };
    }

    const result = await GroupService.addGroupMember(groupId, artistId);

    if (result.success && result.data) {
      logSecurityEvent({
        event: 'media.group.member.added',
        userId: session.user.id,
        metadata: {
          groupId,
          artistId,
          success: true,
        },
      });

      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      error: !result.success ? result.error : 'Failed to add artist to group',
    };
  } catch (err) {
    logError('Add group member action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
};

/**
 * Remove an artist from a group
 */
export const removeGroupMemberAction = async (
  groupId: string,
  artistId: string
): Promise<RemoveGroupMemberResult> => {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to remove group members' };
    }

    const result = await GroupService.removeGroupMember(groupId, artistId);

    if (result.success) {
      logSecurityEvent({
        event: 'media.group.member.removed',
        userId: session.user.id,
        metadata: {
          groupId,
          artistId,
          success: true,
        },
      });

      return { success: true };
    }

    return {
      success: false,
      error: !result.success ? result.error : 'Failed to remove artist from group',
    };
  } catch (err) {
    logError('Remove group member action error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
};
