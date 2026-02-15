/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Split a full name into first and last name components
 * @param fullName - The full name to split
 * @returns An object with firstName and lastName properties
 */
export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmedName = fullName.trim();

  if (!trimmedName) {
    return { firstName: '', lastName: '' };
  }

  const parts = trimmedName.split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}
