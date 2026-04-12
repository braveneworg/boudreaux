/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { cache } from '@/lib/utils/simple-cache';

import { requireRole } from '../utils/auth/require-role';

/**
 * Invalidates the in-memory featured artists cache and the landing page route cache.
 * Called from the admin UI to ensure the public landing page shows fresh content.
 */
export const publishFeaturedArtistsToSiteAction = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    cache.deleteByPrefix('featured-artists:');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to publish featured artists to site:', error);
    return { success: false, error: 'Failed to publish featured artists to landing page' };
  }
};
