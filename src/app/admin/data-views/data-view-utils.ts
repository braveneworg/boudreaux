/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { toPascalCase } from '@/lib/utils/string-utils';

/**
 * Cleans up malformed URLs that may have duplicate protocols (e.g., https://https://)
 */
export const cleanImageUrl = (url: string): string => {
  if (!url) return url;
  // Fix double https:// protocol
  return url.replace(/^https?:\/\/https?:\/\//, 'https://');
};

/**
 * Safely reads a dynamic field from a record without exposing the codebase to
 * prototype-pollution-style object injection. Returns `undefined` when the key
 * is absent.
 */
export const readField = (record: Record<string, unknown>, key: string): unknown =>
  new Map(Object.entries(record)).get(key);

/**
 * Turns a camelCase field key into a spaced, title-cased label
 * (e.g. `publishedOn` -> `Published On`).
 */
export const toFieldLabel = (field: string): string =>
  toPascalCase(field)
    .split(/(?=[A-Z])/)
    .join(' ');

/**
 * Formats a raw field value as a locale date string (M/D/YYYY), or `-` when absent.
 */
export const formatFieldDate = (value: unknown): string => {
  if (!value) return '-';
  return new Date(value as string).toLocaleDateString('default', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
};
