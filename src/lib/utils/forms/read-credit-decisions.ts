/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { CreditDecisions } from '@/lib/utils/credit-confirmation';
import { creditDecisionsSchema } from '@/lib/validation/credit-decisions-schema';

/** The `FormData` field a release form sends its credit decisions in, as JSON. */
export const CREDIT_DECISIONS_FIELD = 'creditDecisions';

/** The decisions a form sent, or `ok: false` when the field is malformed. */
export type ReadCreditDecisions = { ok: true; decisions: CreditDecisions } | { ok: false };

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/**
 * Read an admin's credit decisions (ADR-0015) from a release form's payload.
 * Read apart from the form fields because it is not one: the confirmation
 * dialog produces it, and `getActionState` strips anything outside the form
 * schema. A form that sent none has made no decisions.
 */
export const readCreditDecisions = (payload: FormData): ReadCreditDecisions => {
  const raw = payload.get(CREDIT_DECISIONS_FIELD);
  const parsed = creditDecisionsSchema.safeParse(typeof raw === 'string' ? parseJson(raw) : {});
  return parsed.success ? { ok: true, decisions: parsed.data } : { ok: false };
};
