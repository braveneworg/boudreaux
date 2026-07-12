/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { format, isValid, parse } from 'date-fns';

const MIN_YEAR = 1900;
const MAX_YEAR = 2099;
const DATE_FORMAT = 'MM/dd/yyyy';

/**
 * Progressively masks free-form input into `mm/dd/yyyy`. Keeps only digits
 * (capped at eight) and inserts the slashes as the day and year begin, so the
 * result is a pure function of the typed digits — backspace and mid-string
 * edits stay predictable.
 */
export const maskDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/**
 * Parses a masked value into a local-midnight `Date`, but only when it is a
 * complete, real, in-range `mm/dd/yyyy`. Round-trips through `format` to reject
 * calendar rollovers (e.g. `02/30/2023`), and enforces the 1900–2099 bound.
 * Returns `null` for anything incomplete or invalid.
 */
export const parseMaskedDate = (masked: string): Date | null => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(masked)) return null;

  const parsed = parse(masked, DATE_FORMAT, new Date());
  if (!isValid(parsed)) return null;
  if (format(parsed, DATE_FORMAT) !== masked) return null;

  const year = parsed.getFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;

  // Normalise to local midnight so a typed date matches calendar selection.
  return new Date(year, parsed.getMonth(), parsed.getDate());
};
