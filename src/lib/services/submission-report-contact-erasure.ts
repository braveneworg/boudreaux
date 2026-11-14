/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SubmissionReportService } from '@/lib/services/submission-report-service';
import { loggers } from '@/lib/utils/logger';

/**
 * The erasure behind what a reporter is told when they leave a contact email:
 * "we erase it after 90 days" (ADR-0028). Every hour, the contact email is
 * taken off every report old enough; the reports stay.
 *
 * The write is the same whoever runs it, so instances that check in the same
 * hour need no claim between them.
 */

/** How often a running server erases what has come due. */
const CHECK_INTERVAL_MS = 3_600_000;

/**
 * Erase now and then every hour, for as long as the server runs. A failed
 * check is logged and the next one still runs. The timer does not keep the
 * process alive.
 *
 * @returns A function that stops the checks.
 */
export const startReportContactErasureMonitor = (): (() => void) => {
  const check = (): void => {
    SubmissionReportService.eraseExpiredContacts(new Date())
      .then((erased) => {
        // A count only: never an address, a report or a submission.
        if (erased > 0) {
          loggers.notifications.info('[report contact erasure] erased contact emails', { erased });
        }
      })
      .catch((error: unknown) => {
        loggers.notifications.error('[report contact erasure] check failed', error);
      });
  };

  check();
  const interval: NodeJS.Timeout = setInterval(check, CHECK_INTERVAL_MS);
  interval.unref();

  return () => clearInterval(interval);
};
