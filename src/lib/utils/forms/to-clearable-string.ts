/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Maps an optional text field from an update form onto the value to persist,
 * so that a field the admin emptied is actually cleared:
 *
 * - `undefined` (the field was not submitted) stays `undefined`, and Prisma
 *   leaves the column untouched.
 * - a submitted blank (`''` or whitespace-only) becomes `null`, which Prisma
 *   writes, clearing the column.
 * - anything else is returned unchanged.
 *
 * The older `value || undefined` shape turned a submitted `''` into
 * `undefined`, so an emptied field silently kept its old value (#759).
 *
 * Clearing writes `null` rather than unsetting the field. On MongoDB a
 * `{ field: null }` filter does not match an ABSENT field, so any future query
 * for "no value" must use `OR: [{ field: null }, { field: { isSet: false } }]`.
 *
 * Update flows only: the client must send blanks for this to fire, so pair it
 * with `objectToFormData(values, { keepEmptyStrings: true })`.
 */
export const toClearableString = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  return value?.trim() ? value : null;
};
