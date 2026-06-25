/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const fullName = (item: Record<string, unknown>): string | null => {
  const firstName = asString(item.firstName);
  const surname = asString(item.surname);
  return firstName && surname ? `${firstName} ${surname}` : null;
};

const releaseTitle = (item: Record<string, unknown>): string | null => {
  if (!item.release || typeof item.release !== 'object') {
    return null;
  }
  return asString((item.release as Record<string, unknown>).title);
};

export const getDisplayName = (item: Record<string, unknown>): string => {
  const resolved =
    asString(item.displayName) ??
    asString(item.title) ??
    asString(item.name) ??
    fullName(item) ??
    releaseTitle(item);

  if (resolved !== null) {
    return resolved;
  }

  console.error('Unable to determine display name for item:', JSON.stringify(item, null, 2));
  return ' - Error: Unknown entity name';
};
