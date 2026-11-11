/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Business days, counted in UTC with no holiday calendar: Monday to Friday.
 * Every function takes the moment it works from, so none of them reads the
 * clock.
 */

const MS_PER_DAY = 86_400_000;
const SATURDAY = 6;
const SUNDAY = 0;

/** Whether a moment falls on a weekday, by its UTC day. */
export const isBusinessDay = (moment: Date): boolean => {
  const day = moment.getUTCDay();

  return day !== SATURDAY && day !== SUNDAY;
};

/**
 * The moment `days` business days before `from`, at the same time of day.
 * It steps back a calendar day at a time and counts only the weekdays it
 * lands on, so a weekend in between costs nothing.
 *
 * @param from - The moment to count back from.
 * @param days - How many business days to go back; zero returns `from`.
 */
export const businessDaysBefore = (from: Date, days: number): Date => {
  let moment = from;
  let remaining = days;

  while (remaining > 0) {
    moment = new Date(moment.getTime() - MS_PER_DAY);
    if (isBusinessDay(moment)) {
      remaining -= 1;
    }
  }

  return moment;
};

/** The UTC day of a moment, as `YYYY-MM-DD`. */
export const utcDay = (moment: Date): string => moment.toISOString().slice(0, 10);
