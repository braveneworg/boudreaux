/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { USUAL_REPLY_TIME } from '@/lib/constants/submissions';

/** Where a submission stands in the queue, as its owner reads it. */
const positionLine = (ahead: number): string => {
  if (ahead <= 0) {
    return "You're next in line for approval.";
  }

  return ahead === 1
    ? '1 submission is ahead of yours.'
    : `${ahead} submissions are ahead of yours.`;
};

/**
 * What an owner is told while their submission awaits approval: how many are
 * ahead of it, and how long a reply usually takes. The count is a count, never
 * a promise of order.
 *
 * @param ahead - How many submissions awaiting approval were published earlier.
 */
export const queuePositionMessage = (ahead: number): string =>
  `${positionLine(ahead)} ${USUAL_REPLY_TIME}`;
