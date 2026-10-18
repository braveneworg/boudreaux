/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { revalidatePath } from 'next/cache';

/**
 * Revalidate the Next.js cache paths a bio change affects: the admin and
 * public artist lists, plus the artist's page. The completion hook of both
 * artist job callback routes (bio generation and images-from-links), so every
 * completion invalidates the same set of pages.
 *
 * @param slug - The artist slug whose page should be revalidated.
 */
export const revalidateArtistBioPaths = (slug: string): void => {
  revalidatePath('/admin/artists');
  revalidatePath('/artists');
  revalidatePath(`/artists/${slug}`);
};
