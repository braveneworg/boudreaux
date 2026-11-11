/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { OVERDUE_BUSINESS_DAYS } from '@/lib/constants/submissions';
import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { remindApproversOfOverdue } from '@/lib/services/submission-notices';
import { businessDaysBefore, isBusinessDay, utcDay } from '@/lib/utils/business-days';
import { loggers } from '@/lib/utils/logger';

/**
 * The daily reminder behind the promise an owner is shown, "we usually reply
 * within 2 to 5 business days" (ADR-0025): while any submission has awaited
 * approval longer than that, every approver is reminded once per business day.
 */

/** The site setting that holds the UTC day the last reminder went out. */
export const OVERDUE_REMINDER_KEY = 'submission-overdue-reminder-day';

/** How often a running server asks whether today's reminder is due. */
const CHECK_INTERVAL_MS = 3_600_000;

export type OverdueReminderOutcome =
  'not-a-business-day' | 'nothing-overdue' | 'already-sent' | 'sent';

/**
 * Send today's reminder if one is due, and say what happened. It is due on a
 * business day, when something has waited more than
 * {@link OVERDUE_BUSINESS_DAYS} business days, and when no instance has sent
 * today's yet. The day is claimed only once something is overdue, and before
 * anything is sent, so two instances checking in the same hour send one
 * reminder between them.
 *
 * @param now - The moment to judge from; nothing here reads the clock.
 */
export const runOverdueReminder = async (now: Date): Promise<OverdueReminderOutcome> => {
  if (!isBusinessDay(now)) {
    return 'not-a-business-day';
  }

  const overdue = await SubmissionRepository.countAwaitingBefore(
    businessDaysBefore(now, OVERDUE_BUSINESS_DAYS)
  );
  if (overdue === 0) {
    return 'nothing-overdue';
  }

  if (!(await SiteSettingsRepository.claimValue(OVERDUE_REMINDER_KEY, utcDay(now)))) {
    return 'already-sent';
  }

  await remindApproversOfOverdue(overdue);

  return 'sent';
};

/**
 * Check for a due reminder now and then every hour, for as long as the server
 * runs. A failed check is logged and the next one still runs. The timer does
 * not keep the process alive.
 *
 * @returns A function that stops the checks.
 */
export const startOverdueReminderMonitor = (): (() => void) => {
  const check = (): void => {
    runOverdueReminder(new Date()).catch((error: unknown) => {
      loggers.notifications.error('[overdue reminder] check failed', error);
    });
  };

  check();
  const interval: NodeJS.Timeout = setInterval(check, CHECK_INTERVAL_MS);
  interval.unref();

  return () => clearInterval(interval);
};
