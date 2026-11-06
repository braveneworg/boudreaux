/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { revalidatePath } from 'next/cache';

/**
 * Revalidate the three public/admin tour surfaces touched by every tour-date
 * mutation. Extracted to avoid repeating the trio across actions.
 */
export const revalidateTourPaths = (): void => {
  revalidatePath('/admin/tours');
  revalidatePath('/tours');
  revalidatePath('/tours/[tourId]', 'page');
};
