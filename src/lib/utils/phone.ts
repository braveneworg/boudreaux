/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Best-effort US-phone → E.164 normalizer.
 *
 * `User.phone` is validated by a US-format regex in
 * `src/lib/validation/profile-schema.ts` (allows `(555) 123-4567`,
 * `555-123-4567`, `1-555-123-4567`, …), but AWS SNS requires E.164.
 * Unnormalizable numbers are sent raw by the blast service (Task 4) and
 * counted as failures — this function never throws.
 *
 * Rules, in order:
 * - Already `+`-prefixed → return unchanged (SNS is the arbiter).
 * - Strip non-digits. 10 digits → `+1` + digits.
 *   11 digits starting with `1` → `+` + digits.
 * - Anything else → `null`.
 */
export const normalizeUsPhoneToE164 = (raw: string): string | null => {
  const trimmed = raw.trim();

  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
};
