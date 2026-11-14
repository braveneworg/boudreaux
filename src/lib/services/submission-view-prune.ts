/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SubmissionViewEventService } from '@/lib/services/submission-view-event-service';
import { loggers } from '@/lib/utils/logger';

/**
 * The deletion behind "a view is kept for thirty days" (ADR-0029). Every
 * hour, the views that no longer count are deleted. Trending reads the same
 * thirty days for itself, so a missed check costs storage and never a wrong
 * row.
 *
 * The delete is the same whoever runs it, so instances that check in the
 * same hour need no claim between them.
 */

/** How often a running server deletes what has aged out. */
const CHECK_INTERVAL_MS = 3_600_000;

/**
 * Prune now and then every hour, for as long as the server runs. A failed
 * check is logged and the next one still runs. The timer does not keep the
 * process alive.
 *
 * @returns A function that stops the checks.
 */
export const startViewPruneMonitor = (): (() => void) => {
  const check = (): void => {
    SubmissionViewEventService.prune(new Date())
      .then((deleted) => {
        // A count only: a view holds nothing about who viewed what.
        if (deleted > 0) {
          loggers.media.info('[view prune] deleted old views', { deleted });
        }
      })
      .catch((error: unknown) => {
        loggers.media.error('[view prune] check failed', error);
      });
  };

  check();
  const interval: NodeJS.Timeout = setInterval(check, CHECK_INTERVAL_MS);
  interval.unref();

  return () => clearInterval(interval);
};
