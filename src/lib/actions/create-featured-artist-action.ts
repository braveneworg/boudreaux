/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { FeaturedArtistsService } from '../services/featured-artists-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { createFeaturedArtistSchema } from '../validation/create-featured-artist-schema';

import type { FormState } from '../types/form-state';

export const createFeaturedArtistAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  if (!session?.user?.id) {
    throw new Error('Session user id is required for audit logging.');
  }
  // Parse artistIds from form data (derived on the client from track/release)
  const artistIds = payload.getAll('artistIds') as string[];
  payload.delete('artistIds');

  const permittedFieldNames = [
    'displayName',
    'description',
    'coverArt',
    'position',
    'featuredOn',
    'featuredUntil',
    'digitalFormatId',
    'releaseId',
    'featuredTrackNumber',
  ];

  // FormData sends all values as strings, so use z.coerce.number() for numeric fields
  // on the server side (the client schema uses z.number() for React Hook Form compatibility)
  const serverSchema = createFeaturedArtistSchema
    .omit({ position: true, featuredTrackNumber: true })
    .extend({
      position: z.coerce
        .number()
        .int({ message: 'Position must be a whole number' })
        .min(0, { message: 'Position must be 0 or greater' }),
      featuredTrackNumber: z.coerce
        .number()
        .int({ message: 'Featured track number must be a whole number' })
        .min(1, { message: 'Featured track number must be at least 1' })
        .optional(),
    });

  const { formState, parsed: baseParsed } = getActionState(
    payload,
    permittedFieldNames,
    serverSchema
  );

  if (!baseParsed.success) {
    formState.success = false;
    if (!formState.errors) {
      formState.errors = {};
    }
    for (const issue of baseParsed.error.issues) {
      const field = issue.path[0]?.toString() ?? 'general';
      if (!formState.errors[field]) {
        formState.errors[field] = [];
      }
      formState.errors[field].push(issue.message);
    }
    return formState;
  }

  try {
    const {
      displayName,
      description,
      coverArt,
      position,
      featuredOn,
      featuredUntil,
      digitalFormatId,
      releaseId,
      featuredTrackNumber,
    } = baseParsed.data;

    // Build Prisma create input
    const createData = {
      displayName: displayName || undefined,
      description: description || undefined,
      coverArt: coverArt || undefined,
      position: position ?? 0,
      featuredOn: featuredOn ? new Date(featuredOn) : new Date(),
      featuredUntil: featuredUntil ? new Date(featuredUntil) : undefined,
      featuredTrackNumber: featuredTrackNumber ?? undefined,
      publishedOn: new Date(),
      artists: {
        connect: artistIds.map((id) => ({ id })),
      },
      ...(digitalFormatId && { digitalFormat: { connect: { id: digitalFormatId } } }),
      ...(releaseId && { release: { connect: { id: releaseId } } }),
    };

    // Create featured artist in database
    const response = await FeaturedArtistsService.createFeaturedArtist(createData);

    // Log featured artist creation for security audit
    logSecurityEvent({
      event: 'media.featured_artist.created',
      userId: session.user.id,
      metadata: {
        createdFields: Object.keys(baseParsed.data).filter(
          (key) => baseParsed.data[key as keyof typeof baseParsed.data] !== undefined
        ),
        artistCount: artistIds.length,
        success: response.success,
      },
    });

    if (response.success) {
      formState.errors = undefined;
      formState.data = { featuredArtistId: response.data?.id };
    } else {
      if (!formState.errors) {
        formState.errors = {};
      }
      formState.errors = { general: [response.error || 'Failed to create featured artist'] };
    }

    formState.success = response.success;

    // Revalidate the create page and featured artists list
    revalidatePath('/admin/featured-artists/new');
    revalidatePath('/admin');
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
