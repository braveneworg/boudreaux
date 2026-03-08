/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getArtistDisplayNameForTour } from './artist-display-name';

import type { Artist, ArtistGroup, Group } from '@prisma/client';

type ArtistWithGroups = Artist & {
  groups: Array<ArtistGroup & { group: Group }>;
};

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

  const baseGroup: Group = {
    id: '1',
    name: 'The Band',
    displayName: 'The Band',
    formedOn: null,
    endedOn: null,
    bio: null,
    shortBio: null,
    publishedOn: null,
    deletedOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseArtistGroup: ArtistGroup = {
    id: '1',
    artistId: '1',
    groupId: '1',
  };

  describe('Fallback Algorithm', () => {
    it('should return artist displayName when present', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: 'Johnny D',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Johnny D');
    });

    it('should return group displayName when artist has no displayName', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        groups: [
          {
            ...baseArtistGroup,
            group: {
              ...baseGroup,
              displayName: 'Cool Band',
            },
          },
        ],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Cool Band');
    });

    it('should return firstName + surname when no displayName or group', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: 'Jane',
        surname: 'Smith',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Jane Smith');
    });

    it('should return "Unknown Artist" when all fields are missing', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: '',
        surname: '',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Unknown Artist');
    });
  });

  describe('Edge Cases', () => {
    it('should prioritize artist displayName over group displayName', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: 'Artist Override',
        groups: [
          {
            ...baseArtistGroup,
            group: {
              ...baseGroup,
              displayName: 'Cool Band',
            },
          },
        ],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Artist Override');
    });

    it('should use first group when artist is in multiple groups', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        groups: [
          {
            ...baseArtistGroup,
            id: '1',
            group: {
              ...baseGroup,
              id: '1',
              displayName: 'First Group',
            },
          },
          {
            ...baseArtistGroup,
            id: '2',
            group: {
              ...baseGroup,
              id: '2',
              displayName: 'Second Group',
            },
          },
        ],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('First Group');
    });

    it('should return firstName only when surname is missing', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: 'Madonna',
        surname: '',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Madonna');
    });

    it('should return surname only when firstName is missing', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: '',
        surname: 'Cher',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Cher');
    });

    it('should trim whitespace from displayName', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: '  Artist Name  ',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('Artist Name');
    });

    it('should trim whitespace from names', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: '  John  ',
        surname: '  Doe  ',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('John Doe');
    });

    it('should handle null group displayName', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: 'John',
        surname: 'Doe',
        groups: [
          {
            ...baseArtistGroup,
            group: {
              ...baseGroup,
              displayName: '',
            },
          },
        ],
      };

      // Should fall back to firstName + surname since group displayName is empty
      expect(getArtistDisplayNameForTour(artist)).toBe('John Doe');
    });

    it('should handle empty groups array', () => {
      const artist: ArtistWithGroups = {
        ...baseArtist,
        displayName: null,
        firstName: 'John',
        surname: 'Doe',
        groups: [],
      };

      expect(getArtistDisplayNameForTour(artist)).toBe('John Doe');
    });
  });
});
