'use server';

import { revalidatePath } from 'next/cache';

import { AudioUploadStatus } from '@prisma/client';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

export interface UpdateTrackAudioResult {
  success: boolean;
  trackId?: string;
  error?: string;
}

/**
 * Update a track's audio URL and upload status after background upload completes
 *
 * @param trackId - The ID of the track to update
 * @param audioUrl - The CDN URL of the uploaded audio file
 * @param status - The upload status (COMPLETED or FAILED)
 * @param error - Optional error message if upload failed
 */
export async function updateTrackAudioAction(
  trackId: string,
  audioUrl: string,
  status: 'COMPLETED' | 'FAILED',
  error?: string
): Promise<UpdateTrackAudioResult> {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return {
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      };
    }

    // Verify track exists and is in PENDING or UPLOADING state
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, audioUploadStatus: true, title: true, audioUrl: true },
    });

    if (!track) {
      return {
        success: false,
        error: 'Track not found',
      };
    }

    if (
      track.audioUploadStatus !== AudioUploadStatus.PENDING &&
      track.audioUploadStatus !== AudioUploadStatus.UPLOADING
    ) {
      return {
        success: false,
        error: `Track upload status is already ${track.audioUploadStatus}`,
      };
    }

    // Update track with new audio URL and status
    await prisma.track.update({
      where: { id: trackId },
      data: {
        audioUrl: status === 'COMPLETED' ? audioUrl : track.audioUrl, // Keep existing URL if failed
        audioUploadStatus:
          status === 'COMPLETED' ? AudioUploadStatus.COMPLETED : AudioUploadStatus.FAILED,
      },
    });

    logSecurityEvent({
      event: 'media.track.updated',
      userId: session.user.id,
      metadata: {
        trackId,
        updateType: 'audio_upload',
        status,
        audioUrl: status === 'COMPLETED' ? audioUrl : undefined,
        error: error || undefined,
      },
    });

    revalidatePath('/admin/tracks');

    return {
      success: true,
      trackId,
    };
  } catch (err) {
    console.error('Error updating track audio:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update track audio',
    };
  }
}

/**
 * Mark a track as uploading (called when upload starts)
 */
export async function markTrackUploadingAction(trackId: string): Promise<UpdateTrackAudioResult> {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return {
        success: false,
        error: 'You must be a logged in admin user to update tracks',
      };
    }

    await prisma.track.update({
      where: { id: trackId },
      data: {
        audioUploadStatus: AudioUploadStatus.UPLOADING,
      },
    });

    return {
      success: true,
      trackId,
    };
  } catch (err) {
    console.error('Error marking track as uploading:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update track status',
    };
  }
}
