/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Artist } from '@/lib/types/media-models';

import { getArtistDisplayName } from './get-artist-display-name';

describe('getArtistDisplayName', () => {
  const baseArtist = {
    id: '1',
    firstName: 'John',
    surname: 'Doe',
    slug: 'john-doe',
    notes: [],
    images: [],
    isPseudonymous: false,
    isActive: true,
    createdAt: new Date(),
  } as unknown as Partial<Artist>;

  describe('when displayName is provided', () => {
    it('should return displayName when it exists', () => {
      const artist = {
        ...baseArtist,
        displayName: 'Johnny D',
        firstName: 'John',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Johnny D');
    });

    it('should prefer displayName over constructed name parts', () => {
      const artist = {
        ...baseArtist,
        displayName: 'The Artist Formerly Known As',
        firstName: 'John',
        middleName: 'Michael',
        surname: 'Doe',
        title: 'Dr',
        suffix: 'Jr',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('The Artist Formerly Known As');
    });

    it('should return displayName even with empty name parts', () => {
      const artist = {
        ...baseArtist,
        displayName: 'Madonna',
        firstName: '',
        surname: '',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Madonna');
    });
  });

  describe('when displayName is not provided', () => {
    it('should construct name from firstName and surname only', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should include title when provided', () => {
      const artist = {
        ...baseArtist,
        title: 'Dr',
        firstName: 'John',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Dr John Doe');
    });

    it('should include suffix when provided', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        surname: 'Doe',
        suffix: 'Jr',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe Jr');
    });

    it('should include title and suffix together', () => {
      const artist = {
        ...baseArtist,
        title: 'Dr',
        firstName: 'John',
        surname: 'Doe',
        suffix: 'III',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Dr John Doe III');
    });

    it('should handle single middle name with initial', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: 'Michael',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John M. Doe');
    });

    it('should handle multiple middle names with initials', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: 'Michael,Robert',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John M.R. Doe');
    });

    it('should handle multiple middle names with spaces', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: 'Michael, Robert',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John M.R. Doe');
    });

    it('should construct full name with all components', () => {
      const artist = {
        ...baseArtist,
        title: 'Dr',
        firstName: 'John',
        middleName: 'Michael,Robert',
        surname: 'Doe',
        suffix: 'Jr',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Dr John M.R. Doe Jr');
    });

    it('should trim extra whitespace from constructed name', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        surname: 'Doe',
      } as Artist;

      const result = getArtistDisplayName(artist);
      expect(result).toBe('John Doe');
      expect(result).not.toContain('  ');
    });
  });

  describe('edge cases', () => {
    it('should handle empty middleName gracefully', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: '',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle undefined middleName', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: null,
        surname: 'Doe',
      } as unknown as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle empty title gracefully', () => {
      const artist = {
        ...baseArtist,
        title: '',
        firstName: 'John',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle undefined title', () => {
      const artist = {
        ...baseArtist,
        title: null,
        firstName: 'John',
        surname: 'Doe',
      } as unknown as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle empty suffix gracefully', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        surname: 'Doe',
        suffix: '',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle undefined suffix', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        surname: 'Doe',
        suffix: null,
      } as unknown as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle all optional fields as empty strings', () => {
      const artist = {
        ...baseArtist,
        title: '',
        firstName: 'John',
        middleName: '',
        surname: 'Doe',
        suffix: '',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle all optional fields as undefined', () => {
      const artist = {
        ...baseArtist,
        title: null,
        firstName: 'John',
        middleName: null,
        surname: 'Doe',
        suffix: null,
      } as unknown as Artist;

      expect(getArtistDisplayName(artist)).toBe('John Doe');
    });

    it('should handle middle name with only commas', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: ',,,',
        surname: 'Doe',
      } as Artist;

      // Should handle empty segments from split
      const result = getArtistDisplayName(artist);
      expect(result).toContain('John');
      expect(result).toContain('Doe');
    });

    it('should handle single-character middle names', () => {
      const artist = {
        ...baseArtist,
        firstName: 'John',
        middleName: 'M',
        surname: 'Doe',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('John M. Doe');
    });
  });

  describe('real-world examples', () => {
    it('should format Dr. Martin Luther King Jr. correctly', () => {
      const artist = {
        ...baseArtist,
        title: 'Dr',
        firstName: 'Martin',
        middleName: 'Luther',
        surname: 'King',
        suffix: 'Jr',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Dr Martin L. King Jr');
    });

    it('should format stage name over real name', () => {
      const artist = {
        ...baseArtist,
        displayName: 'Bono',
        firstName: 'Paul',
        middleName: 'David',
        surname: 'Hewson',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Bono');
    });

    it('should format classical composer names', () => {
      const artist = {
        ...baseArtist,
        firstName: 'Wolfgang',
        middleName: 'Amadeus',
        surname: 'Mozart',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Wolfgang A. Mozart');
    });

    it('should format names with multiple titles', () => {
      const artist = {
        ...baseArtist,
        title: 'Sir',
        firstName: 'Paul',
        surname: 'McCartney',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Sir Paul McCartney');
    });

    it('should format names with Roman numeral suffixes', () => {
      const artist = {
        ...baseArtist,
        firstName: 'Robert',
        surname: 'Smith',
        suffix: 'III',
      } as Artist;

      expect(getArtistDisplayName(artist)).toBe('Robert Smith III');
    });
  });

  describe('type safety', () => {
    it('should accept Artist type with all required fields', () => {
      const artist = {
        id: '1',
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        notes: [],
        images: [],
        artistLabels: [],
        artistGroups: [],
        artistReleases: [],
        urls: [],
        isPseudonymous: false,
        isActive: true,
        createdAt: new Date(),
      } as unknown as Artist;

      expect(() => getArtistDisplayName(artist)).not.toThrow();
    });
  });
});
