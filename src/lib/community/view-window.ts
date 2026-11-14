/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The time rules of a view (ADR-0029). A view counts for thirty days and is
 * deleted when it stops counting; Trending and the prune both read the start
 * of that stretch from here, so they cannot disagree. A viewer is counted
 * once per UTC day.
 */

import { VIEW_WINDOW_DAYS } from '@/lib/constants/submissions';

const MS_PER_DAY = 86_400_000;

/** How many characters of an ISO timestamp are its date: `YYYY-MM-DD`. */
const ISO_DATE_LENGTH = 10;

/** The earliest moment a view still counts at `now`: thirty days before it. */
export const viewWindowStart = (now: Date): Date =>
  new Date(now.getTime() - VIEW_WINDOW_DAYS * MS_PER_DAY);

/** The UTC day a moment falls on, as `YYYY-MM-DD`. */
export const utcDayOf = (moment: Date): string => moment.toISOString().slice(0, ISO_DATE_LENGTH);
