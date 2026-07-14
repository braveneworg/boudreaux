/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Split a full name into firstName, middleName, surname, and displayName components
 * @param fullName - The full name to split
 * @returns An object with firstName, middleName, surname, and displayName properties
 */
export interface ArtistNameParts {
  firstName: string;
  middleName: string;
  surname: string;
  displayName: string;
}

export const splitArtistNameParts = (fullName: string): ArtistNameParts => {
  const trimmedName = fullName.trim();

  if (!trimmedName) {
    return {
      firstName: '',
      middleName: '',
      surname: '',
      displayName: '',
    };
  }

  const tokens = trimmedName.split(/\s+/);

  if (tokens.length === 1) {
    return {
      firstName: tokens[0],
      middleName: '',
      surname: '',
      displayName: tokens[0],
    };
  }

  if (tokens.length === 2) {
    return {
      firstName: tokens[0],
      middleName: '',
      surname: tokens[1],
      displayName: `${tokens[0]} ${tokens[1]}`,
    };
  }

  const firstName = tokens[0];
  const surname = tokens[tokens.length - 1];
  const middleTokens = tokens.slice(1, tokens.length - 1);
  const middleName = middleTokens.join(' ');
  const displayName = tokens.join(' ');

  return {
    firstName,
    middleName,
    surname,
    displayName,
  };
};
