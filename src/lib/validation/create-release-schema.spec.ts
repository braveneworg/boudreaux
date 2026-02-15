/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createReleaseSchema, type ReleaseFormData } from './create-release-schema';

describe('create-release-schema', () => {
  // Valid MongoDB ObjectId for testing
  const validArtistId = '507f1f77bcf86cd799439011';
  const validGroupId = '507f1f77bcf86cd799439012';

  const validData: ReleaseFormData = {
    title: 'Test Album',
    releasedOn: '2024-01-15',
    coverArt: 'https://example.com/cover.jpg',
    formats: ['DIGITAL', 'VINYL'],
    artistIds: [validArtistId], // At least one artist required
    labels: 'Test Label',
    catalogNumber: 'CAT-001',
    description: 'A test album description',
    notes: 'Internal notes',
    executiveProducedBy: 'John Doe',
    coProducedBy: 'Jane Smith',
    masteredBy: 'Audio Master',
    mixedBy: 'Mix Engineer',
    recordedBy: 'Studio Tech',
    artBy: 'Artist Name',
    designBy: 'Designer Name',
    photographyBy: 'Photographer Name',
    linerNotesBy: 'Writer Name',
  };

  describe('title validation', () => {
    it('should accept valid titles', () => {
      const validTitles = ['Test Album', 'A', 'Album with Special Characters: #1!'];

      validTitles.forEach((title) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          title,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty title', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        title: '',
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const titleErrors = errorResult.error.issues.filter((issue) => issue.path[0] === 'title');
      expect(titleErrors.length).toBeGreaterThan(0);
      expect(titleErrors[0].message).toBe('Title is required');
    });

    it('should reject title exceeding 200 characters', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const titleErrors = errorResult.error.issues.filter((issue) => issue.path[0] === 'title');
      expect(titleErrors.length).toBeGreaterThan(0);
      expect(titleErrors[0].message).toBe('Title must be less than 200 characters');
    });

    it('should accept title at max length', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        title: 'a'.repeat(200),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('releasedOn validation', () => {
    it('should accept valid date strings', () => {
      const validDates = ['2024-01-15', '2023-12-31', '2000-01-01'];

      validDates.forEach((releasedOn) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          releasedOn,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty date', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        releasedOn: '',
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const dateErrors = errorResult.error.issues.filter((issue) => issue.path[0] === 'releasedOn');
      expect(dateErrors.length).toBeGreaterThan(0);
      expect(dateErrors[0].message).toBe('Release date is required');
    });
  });

  describe('coverArt validation', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com/cover.jpg',
        'http://cdn.example.com/images/album.png',
        'https://s3.amazonaws.com/bucket/image.webp',
      ];

      validUrls.forEach((coverArt) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          coverArt,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty coverArt', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        coverArt: '',
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const coverArtErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'coverArt'
      );
      expect(coverArtErrors.length).toBeGreaterThan(0);
      expect(coverArtErrors[0].message).toBe('Cover art URL is required');
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'just-text', '/local/path/image.jpg'];

      invalidUrls.forEach((coverArt) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          coverArt,
        });
        expect(result.success).toBe(false);
        const errorResult = result as {
          success: false;
          error: { issues: Array<{ path: string[] }> };
        };
        const coverArtErrors = errorResult.error.issues.filter(
          (issue) => issue.path[0] === 'coverArt'
        );
        expect(coverArtErrors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('formats validation', () => {
    it('should accept valid format arrays', () => {
      const validFormats = [['DIGITAL'], ['VINYL', 'CD'], ['DIGITAL', 'MP3_320KBPS', 'FLAC']];

      validFormats.forEach((formats) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          formats,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty formats array', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        formats: [],
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const formatsErrors = errorResult.error.issues.filter((issue) => issue.path[0] === 'formats');
      expect(formatsErrors.length).toBeGreaterThan(0);
      expect(formatsErrors[0].message).toBe('At least one format is required');
    });

    it('should reject invalid format values', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        formats: ['INVALID_FORMAT'],
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[] }> };
      };
      const formatsErrors = errorResult.error.issues.filter((issue) => issue.path[0] === 'formats');
      expect(formatsErrors.length).toBeGreaterThan(0);
    });

    it('should accept all valid format types', () => {
      const allValidFormats = [
        'DIGITAL',
        'MP3_320KBPS',
        'FLAC',
        'WAV',
        'AAC',
        'VINYL',
        'VINYL_7_INCH',
        'VINYL_10_INCH',
        'VINYL_12_INCH',
        'VINYL_180G',
        'VINYL_COLORED',
        'VINYL_GATEFOLD',
        'VINYL_DOUBLE_LP',
        'CD',
        'CASSETTE',
      ];

      allValidFormats.forEach((format) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          formats: [format],
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('optional fields validation', () => {
    it('should accept empty optional fields', () => {
      const minimalData = {
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        artistIds: [validArtistId], // At least one artist required
      };

      const result = createReleaseSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should accept labels as empty string', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        labels: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject labels exceeding 500 characters', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        labels: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const labelsErrors = errorResult.error.issues.filter((issue) => issue.path[0] === 'labels');
      expect(labelsErrors.length).toBeGreaterThan(0);
      expect(labelsErrors[0].message).toBe('Labels must be less than 500 characters');
    });

    it('should reject catalogNumber exceeding 100 characters', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        catalogNumber: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const errors = errorResult.error.issues.filter((issue) => issue.path[0] === 'catalogNumber');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe('Catalog number must be less than 100 characters');
    });

    it('should reject description exceeding 5000 characters', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        description: 'a'.repeat(5001),
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const errors = errorResult.error.issues.filter((issue) => issue.path[0] === 'description');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe('Description must be less than 5000 characters');
    });

    it('should reject notes exceeding 2000 characters', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        notes: 'a'.repeat(2001),
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const errors = errorResult.error.issues.filter((issue) => issue.path[0] === 'notes');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe('Notes must be less than 2000 characters');
    });
  });

  describe('credits fields validation', () => {
    const creditFields = [
      { field: 'executiveProducedBy', name: 'Executive produced by' },
      { field: 'coProducedBy', name: 'Co-produced by' },
      { field: 'masteredBy', name: 'Mastered by' },
      { field: 'mixedBy', name: 'Mixed by' },
      { field: 'recordedBy', name: 'Recorded by' },
      { field: 'artBy', name: 'Art by' },
      { field: 'designBy', name: 'Design by' },
      { field: 'photographyBy', name: 'Photography by' },
      { field: 'linerNotesBy', name: 'Liner notes by' },
    ];

    creditFields.forEach(({ field, name }) => {
      it(`should accept empty ${field}`, () => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          [field]: '',
        });
        expect(result.success).toBe(true);
      });

      it(`should reject ${field} exceeding 500 characters`, () => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          [field]: 'a'.repeat(501),
        });
        expect(result.success).toBe(false);
        const errorResult = result as {
          success: false;
          error: { issues: Array<{ path: string[]; message: string }> };
        };
        const errors = errorResult.error.issues.filter((issue) => issue.path[0] === field);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toBe(`${name} must be less than 500 characters`);
      });
    });
  });

  describe('featured fields validation', () => {
    it('should accept empty featured fields', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        featuredOn: '',
        featuredUntil: '',
        featuredDescription: '',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid featured dates', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        featuredOn: '2024-01-15',
        featuredUntil: '2024-02-15',
        featuredDescription: 'Featured release of the month',
      });
      expect(result.success).toBe(true);
    });

    it('should reject featuredDescription exceeding 500 characters', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        featuredDescription: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const errors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'featuredDescription'
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe('Featured description must be less than 500 characters');
    });
  });

  describe('createdBy validation', () => {
    it('should accept valid MongoDB ObjectId', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        createdBy: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined createdBy', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        createdBy: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid MongoDB ObjectId format', () => {
      const invalidIds = ['invalid-id', '12345', 'not24chars', 'zzzzzzzzzzzzzzzzzzzzzzzz'];

      invalidIds.forEach((createdBy) => {
        const result = createReleaseSchema.safeParse({
          ...validData,
          createdBy,
        });
        expect(result.success).toBe(false);
        const errorResult = result as {
          success: false;
          error: { issues: Array<{ path: string[]; message: string }> };
        };
        const errors = errorResult.error.issues.filter((issue) => issue.path[0] === 'createdBy');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toBe('Invalid MongoDB ObjectId format');
      });
    });
  });

  describe('publishedAt validation', () => {
    it('should accept valid ISO date string', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        publishedAt: '2024-01-15T12:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty publishedAt', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        publishedAt: '',
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined publishedAt', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        publishedAt: undefined,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('full form validation', () => {
    it('should accept complete valid data', () => {
      const result = createReleaseSchema.safeParse(validData);
      expect(result.success).toBe(true);
      const successResult = result as { success: true; data: ReleaseFormData };
      expect(successResult.data.title).toBe(validData.title);
      expect(successResult.data.releasedOn).toBe(validData.releasedOn);
      expect(successResult.data.coverArt).toBe(validData.coverArt);
      expect(successResult.data.formats).toEqual(validData.formats);
    });

    it('should accept minimal required data', () => {
      const minimalData = {
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        artistIds: [validArtistId], // At least one artist required
      };

      const result = createReleaseSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject data missing required fields', () => {
      const result = createReleaseSchema.safeParse({
        title: 'Test Album',
        // Missing releasedOn, coverArt, formats
      });
      expect(result.success).toBe(false);
    });
  });

  describe('artist and group validation', () => {
    it('should accept data with at least one artist', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        artistIds: [validArtistId],
        groupIds: [],
      });
      expect(result.success).toBe(true);
    });

    it('should accept data with at least one group', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        artistIds: [],
        groupIds: [validGroupId],
      });
      expect(result.success).toBe(true);
    });

    it('should accept data with both artists and groups', () => {
      const result = createReleaseSchema.safeParse({
        ...validData,
        artistIds: [validArtistId],
        groupIds: [validGroupId],
      });
      expect(result.success).toBe(true);
    });

    it('should reject data with no artists and no groups', () => {
      const result = createReleaseSchema.safeParse({
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        artistIds: [],
        groupIds: [],
      });
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('At least one Artist or one Group is required');
    });

    it('should reject data with undefined artists and groups', () => {
      const result = createReleaseSchema.safeParse({
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
      });
      expect(result.success).toBe(false);
      expect(
        (result as { success: false; error: { issues: Array<{ message: string }> } }).error
          .issues[0].message
      ).toBe('At least one Artist or one Group is required');
    });
  });
});
