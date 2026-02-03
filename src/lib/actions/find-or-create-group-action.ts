'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

import type { Prisma } from '@prisma/client';

/**
 * Result of finding or creating a group
 */
export interface FindOrCreateGroupResult {
  success: boolean;
  /** The group ID if found or created */
  groupId?: string;
  /** The group display name */
  groupName?: string;
  /** Whether the group was newly created (vs found existing) */
  created?: boolean;
  /** Whether an ArtistGroup was created */
  artistGroupCreated?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for finding or creating a group
 */
export interface FindOrCreateGroupOptions {
  /** Artist ID to associate with this group (creates ArtistGroup) */
  artistId?: string;
  /** Prisma transaction client (for wrapping in a larger transaction) */
  tx?: Prisma.TransactionClient;
}

/**
 * Find an existing group by name (case-insensitive) or create a new one.
 * Optionally creates ArtistGroup association.
 * This action requires admin role.
 *
 * @param groupName - The group name from audio metadata (typically albumArtist)
 * @param options - Optional settings for artist associations and transaction
 * @returns Result indicating success/failure and the group ID
 */
export async function findOrCreateGroupAction(
  groupName: string,
  options: FindOrCreateGroupOptions = {}
): Promise<FindOrCreateGroupResult> {
  await requireRole('admin');

  // Validate required field
  if (!groupName || groupName.trim() === '') {
    return {
      success: false,
      error: 'Group name is required',
    };
  }

  const name = groupName.trim();
  const { artistId, tx } = options;
  // Use provided transaction client or default prisma client
  const db = tx || prisma;

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return {
        success: false,
        error: 'You must be a logged in admin user to manage groups',
      };
    }

    // Try to find an existing group by name or displayName (case-insensitive)
    const existingGroup = await db.group.findFirst({
      where: {
        OR: [
          {
            name: {
              equals: name,
              mode: 'insensitive',
            },
          },
          {
            displayName: {
              equals: name,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        displayName: true,
      },
    });

    if (existingGroup) {
      const displayName = existingGroup.displayName || existingGroup.name;

      // Create ArtistGroup association if artistId provided and doesn't exist
      let artistGroupCreated = false;

      if (artistId) {
        const existingArtistGroup = await db.artistGroup.findUnique({
          where: {
            artistId_groupId: {
              artistId,
              groupId: existingGroup.id,
            },
          },
        });

        if (!existingArtistGroup) {
          await db.artistGroup.create({
            data: {
              artistId,
              groupId: existingGroup.id,
            },
          });
          artistGroupCreated = true;
        }
      }

      logSecurityEvent({
        event: 'media.group.found',
        userId: session.user.id,
        metadata: {
          groupId: existingGroup.id,
          groupName: displayName,
          searchedName: name,
          artistGroupCreated,
        },
      });

      return {
        success: true,
        groupId: existingGroup.id,
        groupName: displayName,
        created: false,
        artistGroupCreated,
      };
    }

    // No existing group found - create a new one
    const newGroup = await db.group.create({
      data: {
        name,
        displayName: name,
        // Create ArtistGroup if artistId provided
        ...(artistId && {
          artistGroups: {
            create: {
              artistId,
            },
          },
        }),
      },
    });

    logSecurityEvent({
      event: 'media.group.created',
      userId: session.user.id,
      metadata: {
        groupId: newGroup.id,
        groupName: name,
        source: 'bulk-upload',
        artistGroupCreated: !!artistId,
      },
    });

    // Only revalidate if not in a transaction (transaction will handle revalidation)
    if (!tx) {
      revalidatePath('/admin/groups');
    }

    return {
      success: true,
      groupId: newGroup.id,
      groupName: name,
      created: true,
      artistGroupCreated: !!artistId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to find or create group';

    console.error('Find or create group error:', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
