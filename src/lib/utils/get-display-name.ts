/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export const getDisplayName = (item: Record<string, unknown>): string => {
  if (item.displayName && typeof item.displayName === 'string') {
    return item.displayName;
  } else if (item.title && typeof item.title === 'string') {
    return item.title;
  } else if (item.name && typeof item.name === 'string') {
    return item.name;
  } else if (
    item.firstName &&
    item.surname &&
    typeof item.firstName === 'string' &&
    typeof item.surname === 'string'
  ) {
    return `${item.firstName} ${item.surname}`;
  } else if (
    item.release &&
    typeof item.release === 'object' &&
    (item.release as Record<string, unknown>).title &&
    typeof (item.release as Record<string, unknown>).title === 'string'
  ) {
    return (item.release as Record<string, unknown>).title as string;
  } else {
    console.error('Unable to determine display name for item:', JSON.stringify(item, null, 2));
    return ' - Error: Unknown entity name';
  }
};
