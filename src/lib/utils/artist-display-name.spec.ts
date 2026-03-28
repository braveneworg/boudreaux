/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getArtistDisplayNameForTour } from './artist-display-name';

import type { Artist } from '@prisma/client';

describe('getArtistDisplayNameForTour', () => {
  const baseArtist: Artist = {
    id: '1',
    firstName: 'John',
    surname: 'Doe',
    middleName: null,
    akaNames: null,
    displayName: null,
    title: null,
    suffix: null,
    phone: null,
    email: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    bio: null,
    shortBio: null,
    altBio: null,
    slug: 'john-doe',
    genres: null,
    bornOn: null,
    diedOn: null,
    formedOn: null,
    publishedOn: null,
    publishedBy: null,
    createdAt: new Date(),
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
    deletedOn: null,
    deletedBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    reactivatedAt: null,
    reactivatedBy: null,
    notes: [],
    tags: null,
    isPseudonymous: false,
    isActive: true,
    instruments: null,
    featuredArtistId: null,
    trackId: null,
  };

  describe('Fallback Algorithm', () => {
    it('should return artist displayName when present', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: 'Johnny D',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Johnny D');
    });

    it('should return firstName + surname when no displayName', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: null,
        firstName: 'Jane',
        surname: 'Smith',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Jane Smith');
    });

    it('should return "Unknown Artist" when all fields are missing', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: null,
        firstName: '',
        surname: '',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Unknown Artist');
    });
  });

  describe('Edge Cases', () => {
    it('should return firstName only when surname is missing', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: null,
        firstName: 'Madonna',
        surname: '',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Madonna');
    });

    it('should return surname only when firstName is missing', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: null,
        firstName: '',
        surname: 'Cher',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Cher');
    });

    it('should trim whitespace from displayName', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: '  Artist Name  ',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Artist Name');
    });

    it('should trim whitespace from names', () => {
      const artist: Artist = {
        ...baseArtist,
        displayName: null,
        firstName: '  John  ',
        surname: '  Doe  ',
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('John Doe');
    });
  });
});
