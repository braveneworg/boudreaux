/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { spendDailyAllowance, type DailyAllowanceTier } from './daily-allowance';

/**
 * The bound on a guest's views (ADR-0029). A guest is told apart by a
 * cookie and a browser fingerprint, and both are the visitor's to change, so
 * on their own they would let one machine add views without end. This is
 * what one address can add instead, over a rolling 24 hours.
 *
 * The address key lives in the limiter for that window and nowhere else:
 * nothing about who viewed a submission is stored with the view.
 */

/**
 * How many guest views one address may add to one submission in a day.
 * Enough for a household that all opened the same link; past it the page
 * still opens and the view is simply not counted. A signed-in viewer is not
 * counted against it.
 */
export const GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION = 5;

const GUEST_VIEW: DailyAllowanceTier = {
  name: 'submission-view:guest-address',
  limit: GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION,
};

/** Deterministic Playwright runs must not trip production-grade limits. */
const isE2E = (): boolean => process.env.E2E_MODE === 'true';

export interface GuestViewAllowanceKey {
  /** The guest's address key (`guestAddressKey`). Never stored outside the limiter. */
  addressKey: string;
  submissionId: string;
}

/**
 * Whether this address may add one more guest view to this submission today,
 * and if so, count it.
 */
export const allowGuestView = async ({
  addressKey,
  submissionId,
}: GuestViewAllowanceKey): Promise<boolean> =>
  isE2E() || spendDailyAllowance(GUEST_VIEW, `${addressKey}:${submissionId}`);
