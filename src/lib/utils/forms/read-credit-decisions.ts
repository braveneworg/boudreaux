/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { CreditDecisions } from '@/lib/utils/credit-confirmation';
import { creditDecisionsSchema } from '@/lib/validation/credit-decisions-schema';

/** The decisions a form sent, or `ok: false` when they are malformed. */
export type ReadCreditDecisions = { ok: true; decisions: CreditDecisions } | { ok: false };

/**
 * Read an admin's credit decisions (ADR-0015) from a release action's input,
 * where the mutation hook puts them beside the form values as
 * `creditDecisions`. Read apart from the form fields because they are not
 * one: the confirmation dialog produces them, and `readActionInput` keeps
 * only the permitted form fields. An input that carries none has made no
 * decisions.
 */
export const readCreditDecisions = (input: unknown): ReadCreditDecisions => {
  const value =
    typeof input === 'object' && input !== null && 'creditDecisions' in input
      ? input.creditDecisions
      : undefined;
  const parsed = creditDecisionsSchema.safeParse(value ?? {});
  return parsed.success ? { ok: true, decisions: parsed.data } : { ok: false };
};
