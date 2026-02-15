/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createTrackSchema, type TrackFormData } from './create-track-schema';

describe('create-track-schema', () => {
  // Valid MongoDB ObjectId for testing
  const validArtistId = '507f1f77bcf86cd799439011';
  const validReleaseId = '507f1f77bcf86cd799439012';
  const validCreatedById = '507f1f77bcf86cd799439013';

  const validData: TrackFormData = {
    title: 'Test Track',
    duration: 225, // 3:45 in seconds
    audioUrl: 'https://example.com/audio.mp3',
    coverArt: 'https://example.com/cover.jpg',
    position: 1,
    artistIds: [validArtistId],
    releaseIds: [validReleaseId],
    publishedOn: '2024-01-15',
    createdBy: validCreatedById,
  };

  describe('title validation', () => {
    it('should accept valid titles', () => {
      const validTitles = ['Test Track', 'A', 'Track with Special Characters: #1!', '123 Numbers'];

      validTitles.forEach((title) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          title,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty title', () => {
      const result = createTrackSchema.safeParse({
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
      const result = createTrackSchema.safeParse({
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

    it('should accept title at max length (200 characters)', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        title: 'a'.repeat(200),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('duration validation', () => {
    it('should accept valid durations', () => {
      const validDurations = [1, 60, 225, 3600, 86400];

      validDurations.forEach((duration) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          duration,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject duration less than 1 second', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        duration: 0,
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const durationErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'duration'
      );
      expect(durationErrors.length).toBeGreaterThan(0);
      expect(durationErrors[0].message).toBe('Duration must be at least 1 second');
    });

    it('should reject negative duration', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        duration: -10,
      });
      expect(result.success).toBe(false);
    });

    it('should reject duration exceeding 24 hours (86400 seconds)', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        duration: 86401,
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const durationErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'duration'
      );
      expect(durationErrors.length).toBeGreaterThan(0);
      expect(durationErrors[0].message).toBe('Duration must be less than 24 hours');
    });

    it('should accept duration at max (86400 seconds = 24 hours)', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        duration: 86400,
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-integer duration', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        duration: 225.5,
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const durationErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'duration'
      );
      expect(durationErrors.length).toBeGreaterThan(0);
      expect(durationErrors[0].message).toBe('Duration must be a whole number');
    });
  });

  describe('audioUrl validation', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com/audio.mp3',
        'http://cdn.example.com/tracks/song.wav',
        'https://s3.amazonaws.com/bucket/track.flac',
      ];

      validUrls.forEach((audioUrl) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          audioUrl,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty audioUrl', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        audioUrl: '',
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const audioUrlErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'audioUrl'
      );
      expect(audioUrlErrors.length).toBeGreaterThan(0);
      expect(audioUrlErrors[0].message).toBe('Audio URL is required');
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'just-text', '/local/path/audio.mp3'];

      invalidUrls.forEach((audioUrl) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          audioUrl,
        });
        expect(result.success).toBe(false);
        const errorResult = result as {
          success: false;
          error: { issues: Array<{ path: string[] }> };
        };
        const audioUrlErrors = errorResult.error.issues.filter(
          (issue) => issue.path[0] === 'audioUrl'
        );
        expect(audioUrlErrors.length).toBeGreaterThan(0);
      });
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
        const result = createTrackSchema.safeParse({
          ...validData,
          coverArt,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept empty coverArt (optional field)', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        coverArt: '',
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined coverArt', () => {
      const dataWithoutCoverArt = { ...validData };
      delete (dataWithoutCoverArt as Partial<TrackFormData>).coverArt;
      const result = createTrackSchema.safeParse(dataWithoutCoverArt);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'just-text', '/local/path/image.jpg'];

      invalidUrls.forEach((coverArt) => {
        const result = createTrackSchema.safeParse({
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

  describe('position validation', () => {
    it('should accept valid positions', () => {
      const validPositions = [0, 1, 10, 100];

      validPositions.forEach((position) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          position,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject negative positions', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        position: -1,
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const positionErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'position'
      );
      expect(positionErrors.length).toBeGreaterThan(0);
      expect(positionErrors[0].message).toBe('Position must be 0 or greater');
    });

    it('should reject non-integer positions', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        position: 1.5,
      });
      expect(result.success).toBe(false);
      const errorResult = result as {
        success: false;
        error: { issues: Array<{ path: string[]; message: string }> };
      };
      const positionErrors = errorResult.error.issues.filter(
        (issue) => issue.path[0] === 'position'
      );
      expect(positionErrors.length).toBeGreaterThan(0);
      expect(positionErrors[0].message).toBe('Position must be a whole number');
    });
  });

  describe('artistIds validation', () => {
    it('should accept valid MongoDB ObjectIds', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        artistIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty artistIds array', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        artistIds: [],
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined artistIds', () => {
      const dataWithoutArtistIds = { ...validData };
      delete (dataWithoutArtistIds as Partial<TrackFormData>).artistIds;
      const result = createTrackSchema.safeParse(dataWithoutArtistIds);
      expect(result.success).toBe(true);
    });

    it('should reject invalid MongoDB ObjectIds', () => {
      const invalidIds = ['invalid-id', '12345', 'not24chars', 'zzzzzzzzzzzzzzzzzzzzzzzz'];

      invalidIds.forEach((invalidId) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          artistIds: [invalidId],
        });
        expect(result.success).toBe(false);
        expect(
          (result as { success: false; error: { issues: Array<{ message: string }> } }).error
            .issues[0].message
        ).toBe('Invalid artist ID format');
      });
    });
  });

  describe('releaseIds validation', () => {
    it('should accept valid MongoDB ObjectIds', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        releaseIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty releaseIds array', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        releaseIds: [],
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined releaseIds', () => {
      const dataWithoutReleaseIds = { ...validData };
      delete (dataWithoutReleaseIds as Partial<TrackFormData>).releaseIds;
      const result = createTrackSchema.safeParse(dataWithoutReleaseIds);
      expect(result.success).toBe(true);
    });

    it('should reject invalid MongoDB ObjectIds', () => {
      const invalidIds = ['invalid-id', '12345', 'not24chars', 'zzzzzzzzzzzzzzzzzzzzzzzz'];

      invalidIds.forEach((invalidId) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          releaseIds: [invalidId],
        });
        expect(result.success).toBe(false);
        expect(
          (result as { success: false; error: { issues: Array<{ message: string }> } }).error
            .issues[0].message
        ).toBe('Invalid release ID format');
      });
    });
  });

  describe('publishedOn validation', () => {
    it('should accept valid date strings', () => {
      const validDates = ['2024-01-15', '2023-12-31', '2024-01-15T12:00:00.000Z'];

      validDates.forEach((publishedOn) => {
        const result = createTrackSchema.safeParse({
          ...validData,
          publishedOn,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept empty publishedOn', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        publishedOn: '',
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined publishedOn', () => {
      const dataWithoutPublishedOn = { ...validData };
      delete (dataWithoutPublishedOn as Partial<TrackFormData>).publishedOn;
      const result = createTrackSchema.safeParse(dataWithoutPublishedOn);
      expect(result.success).toBe(true);
    });
  });

  describe('createdBy validation', () => {
    it('should accept valid MongoDB ObjectId', () => {
      const result = createTrackSchema.safeParse({
        ...validData,
        createdBy: '507f1f77bcf86cd799439011',
      });
      expect(result.success).toBe(true);
    });

    it('should accept undefined createdBy', () => {
      const dataWithoutCreatedBy = { ...validData };
      delete (dataWithoutCreatedBy as Partial<TrackFormData>).createdBy;
      const result = createTrackSchema.safeParse(dataWithoutCreatedBy);
      expect(result.success).toBe(true);
    });

    it('should reject invalid MongoDB ObjectId format', () => {
      const invalidIds = ['invalid-id', '12345', 'not24chars', 'zzzzzzzzzzzzzzzzzzzzzzzz'];

      invalidIds.forEach((createdBy) => {
        const result = createTrackSchema.safeParse({
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

  describe('full form validation', () => {
    it('should accept complete valid data', () => {
      const result = createTrackSchema.safeParse(validData);
      expect(result.success).toBe(true);
      const successResult = result as { success: true; data: TrackFormData };
      expect(successResult.data.title).toBe(validData.title);
      expect(successResult.data.duration).toBe(validData.duration);
      expect(successResult.data.audioUrl).toBe(validData.audioUrl);
      expect(successResult.data.position).toBe(validData.position);
    });

    it('should accept minimal required data', () => {
      const minimalData = {
        title: 'Test Track',
        duration: 180,
        audioUrl: 'https://example.com/audio.mp3',
        position: 0,
      };

      const result = createTrackSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject data missing required fields', () => {
      const incompleteData = {
        title: 'Test Track',
        // Missing duration, audioUrl, position
      };
      const result = createTrackSchema.safeParse(incompleteData);
      expect(result.success).toBe(false);
    });

    it('should reject data with missing title', () => {
      const dataWithoutTitle = { ...validData };
      delete (dataWithoutTitle as Partial<TrackFormData>).title;
      const result = createTrackSchema.safeParse(dataWithoutTitle);
      expect(result.success).toBe(false);
    });

    it('should reject data with missing duration', () => {
      const dataWithoutDuration = { ...validData };
      delete (dataWithoutDuration as Partial<TrackFormData>).duration;
      const result = createTrackSchema.safeParse(dataWithoutDuration);
      expect(result.success).toBe(false);
    });

    it('should reject data with missing audioUrl', () => {
      const dataWithoutAudioUrl = { ...validData };
      delete (dataWithoutAudioUrl as Partial<TrackFormData>).audioUrl;
      const result = createTrackSchema.safeParse(dataWithoutAudioUrl);
      expect(result.success).toBe(false);
    });

    it('should reject data with missing position', () => {
      const dataWithoutPosition = { ...validData };
      delete (dataWithoutPosition as Partial<TrackFormData>).position;
      const result = createTrackSchema.safeParse(dataWithoutPosition);
      expect(result.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should correctly infer TrackFormData type', () => {
      const result = createTrackSchema.safeParse(validData);
      expect(result.success).toBe(true);
      const data: TrackFormData = (result as { success: true; data: TrackFormData }).data;
      expect(typeof data.title).toBe('string');
      expect(typeof data.duration).toBe('number');
      expect(typeof data.audioUrl).toBe('string');
      expect(typeof data.position).toBe('number');
    });
  });
});
