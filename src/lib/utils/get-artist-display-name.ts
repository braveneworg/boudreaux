/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Artist } from '@/lib/types/media-models';

export const getArtistDisplayName = (artist: Artist) => {
  // prefer displayName, otherwise construct from name parts
  const { displayName, firstName, middleName, surname, title, suffix } = artist;

  if (displayName) {
    return displayName;
  }

  // Build name parts array, filtering out undefined/empty values
  const nameParts: string[] = [];

  if (title) nameParts.push(title);
  nameParts.push(firstName);

  // Handle middle name(s) - convert to initials
  if (middleName) {
    const initials = middleName
      .split(',')
      .map((name: string) => name.trim())
      .filter((name: string) => name.length > 0)
      .map((name: string) => `${name[0].toUpperCase()}.`)
      .join('');
    if (initials) nameParts.push(initials);
  }

  nameParts.push(surname);
  if (suffix) nameParts.push(suffix);

  return nameParts.join(' ');
};
