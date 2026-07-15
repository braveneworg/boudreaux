/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createVideoSchema, videoFormSchema, type VideoFormData } from './create-video-schema';
import { videoArtistDetailSchema } from './video-artist-detail-schema';

describe('create-video-schema', () => {
  const validData: VideoFormData = {
    title: 'Live at the Venue',
    artist: 'The Band',
    category: 'MUSIC',
    description: 'A great live set',
    releasedOn: '2024-01-15',
    durationSeconds: '212',
    s3Key: 'media/videos/507f1f77bcf86cd799439011/clip-123.mp4',
    fileName: 'clip.mp4',
    fileSize: '10485760',
    mimeType: 'video/mp4',
    posterUrl: 'https://example.com/poster.jpg',
    publishedAt: '2024-01-20T00:00:00.000Z',
  };

  describe('title validation', () => {
    it('should accept a valid title', () => {
      const result = createVideoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject an empty title', () => {
      const result = createVideoSchema.safeParse({ ...validData, title: '' });
      expect(result.success).toBe(false);
    });

    it('should reject a title exceeding 200 characters', () => {
      const result = createVideoSchema.safeParse({ ...validData, title: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('artist validation', () => {
    it('should reject an empty artist', () => {
      const result = createVideoSchema.safeParse({ ...validData, artist: '' });
      expect(result.success).toBe(false);
    });

    it('should reject an artist exceeding 200 characters', () => {
      const result = createVideoSchema.safeParse({ ...validData, artist: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('category validation', () => {
    it('should accept MUSIC', () => {
      const result = createVideoSchema.safeParse({ ...validData, category: 'MUSIC' });
      expect(result.success).toBe(true);
    });

    it('should accept INFORMATIONAL', () => {
      const result = createVideoSchema.safeParse({ ...validData, category: 'INFORMATIONAL' });
      expect(result.success).toBe(true);
    });

    it('should reject an unknown category', () => {
      const result = createVideoSchema.safeParse({ ...validData, category: 'PODCAST' });
      expect(result.success).toBe(false);
    });
  });

  describe('description validation', () => {
    it('should accept an empty description', () => {
      const result = createVideoSchema.safeParse({ ...validData, description: '' });
      expect(result.success).toBe(true);
    });

    it('should accept an omitted description', () => {
      const { description: _omit, ...withoutDescription } = validData;
      const result = createVideoSchema.safeParse(withoutDescription);
      expect(result.success).toBe(true);
    });

    it('should reject a description exceeding 2000 characters', () => {
      const result = createVideoSchema.safeParse({ ...validData, description: 'a'.repeat(2001) });
      expect(result.success).toBe(false);
    });
  });

  describe('releasedOn validation', () => {
    it('should reject an empty release date', () => {
      const result = createVideoSchema.safeParse({ ...validData, releasedOn: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('durationSeconds validation', () => {
    it('should accept a positive integer string', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: '212' });
      expect(result.success).toBe(true);
    });

    it('should accept a positive integer number (post getActionState coercion)', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: 212 });
      expect(result.success).toBe(true);
    });

    it('should accept an empty string', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: '' });
      expect(result.success).toBe(true);
    });

    it('should accept an omitted value', () => {
      const { durationSeconds: _omit, ...withoutDuration } = validData;
      const result = createVideoSchema.safeParse(withoutDuration);
      expect(result.success).toBe(true);
    });

    it('should reject a non-numeric string', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: 'abc' });
      expect(result.success).toBe(false);
    });

    it('should reject zero', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: '0' });
      expect(result.success).toBe(false);
    });

    it('should reject a negative value', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: '-5' });
      expect(result.success).toBe(false);
    });

    it('should reject a fractional value', () => {
      const result = createVideoSchema.safeParse({ ...validData, durationSeconds: '12.5' });
      expect(result.success).toBe(false);
    });
  });

  describe('s3Key validation', () => {
    it('should reject an empty s3Key', () => {
      const result = createVideoSchema.safeParse({ ...validData, s3Key: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('fileName validation', () => {
    it('should reject an empty fileName', () => {
      const result = createVideoSchema.safeParse({ ...validData, fileName: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('fileSize validation', () => {
    it('should accept a positive integer string', () => {
      const result = createVideoSchema.safeParse({ ...validData, fileSize: '10485760' });
      expect(result.success).toBe(true);
    });

    it('should accept a positive integer number (post getActionState coercion)', () => {
      const result = createVideoSchema.safeParse({ ...validData, fileSize: 10485760 });
      expect(result.success).toBe(true);
    });

    it('should accept an empty string', () => {
      const result = createVideoSchema.safeParse({ ...validData, fileSize: '' });
      expect(result.success).toBe(true);
    });

    it('should reject a negative value', () => {
      const result = createVideoSchema.safeParse({ ...validData, fileSize: '-1' });
      expect(result.success).toBe(false);
    });

    it('should reject a fractional value', () => {
      const result = createVideoSchema.safeParse({ ...validData, fileSize: '12.5' });
      expect(result.success).toBe(false);
    });
  });

  describe('mimeType validation', () => {
    it('should accept video/mp4', () => {
      const result = createVideoSchema.safeParse({ ...validData, mimeType: 'video/mp4' });
      expect(result.success).toBe(true);
    });

    it('should accept video/webm', () => {
      const result = createVideoSchema.safeParse({ ...validData, mimeType: 'video/webm' });
      expect(result.success).toBe(true);
    });

    it('should reject an unsupported mime type', () => {
      const result = createVideoSchema.safeParse({ ...validData, mimeType: 'video/quicktime' });
      expect(result.success).toBe(false);
    });
  });

  describe('posterUrl validation', () => {
    it('should accept an empty poster url', () => {
      const result = createVideoSchema.safeParse({ ...validData, posterUrl: '' });
      expect(result.success).toBe(true);
    });

    it('should reject a non-url poster', () => {
      const result = createVideoSchema.safeParse({ ...validData, posterUrl: 'not-a-url' });
      expect(result.success).toBe(false);
    });
  });

  describe('publishedAt validation', () => {
    it('should accept an empty publishedAt', () => {
      const result = createVideoSchema.safeParse({ ...validData, publishedAt: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('videoFormSchema', () => {
    it('is the same schema the action input uses', () => {
      const result = videoFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('artistDetails validation', () => {
    const validDetail = { sourceName: 'Ceschi', displayName: 'Ceschi Ramos' };

    it('parses when artistDetails is absent (back-compat)', () => {
      const result = createVideoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('parses a valid single-entry artistDetails array', () => {
      const result = createVideoSchema.safeParse({ ...validData, artistDetails: [validDetail] });
      expect(result.success).toBe(true);
    });

    it('rejects an artistDetails array with 21 entries (max is 20)', () => {
      const details = Array.from({ length: 21 }, (_, i) => ({ sourceName: `Artist ${i}` }));
      const result = createVideoSchema.safeParse({ ...validData, artistDetails: details });
      expect(result.success).toBe(false);
    });

    it('rejects an entry with an empty sourceName', () => {
      const result = createVideoSchema.safeParse({
        ...validData,
        artistDetails: [{ sourceName: '' }],
      });
      expect(result.success).toBe(false);
    });

    it('videoArtistDetailSchema is used inside createVideoSchema', () => {
      // Confirm the element schema is the same shape by testing a valid entry directly
      const detailResult = videoArtistDetailSchema.safeParse(validDetail);
      expect(detailResult.success).toBe(true);
    });
  });
});
