/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { ISO_DATE_PATTERN, isRealCalendarDate } from '@/lib/utils/validation/iso-date';

/**
 * The single-field release-date payload the edit form autosaves: a real
 * `YYYY-MM-DD` calendar day, or `''` to clear it. A full ISO datetime is
 * rejected on purpose — the form normalises to a day before it ever reaches
 * the server, so anything else is a bug, not input to be coerced.
 */
export const videoReleaseDateSchema = z.union([
  z.literal(''),
  z
    .string()
    .regex(ISO_DATE_PATTERN, { message: 'Release date must be YYYY-MM-DD' })
    .refine(isRealCalendarDate, { message: 'Release date is not a calendar day' }),
]);

export type VideoReleaseDateInput = z.infer<typeof videoReleaseDateSchema>;
