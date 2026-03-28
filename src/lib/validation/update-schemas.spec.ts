/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  updateArtistSchema,
  updateFeaturedArtistSchema,
  updateNotificationBannerSchema,
  updateReleaseSchema,
  updateTrackSchema,
} from './update-schemas';

const validObjectId = '507f1f77bcf86cd799439011';

describe('update-schemas', () => {
  describe('updateArtistSchema', () => {
    it('should accept an empty object (all fields optional)', () => {
      const result = updateArtistSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept a single field update', () => {
      const result = updateArtistSchema.safeParse({ firstName: 'Updated' });
      expect(result.success).toBe(true);
      expect(result.success && result.data.firstName).toBe('Updated');
    });

    it('should accept multiple field updates', () => {
      const result = updateArtistSchema.safeParse({
        firstName: 'Updated',
        surname: 'Name',
        bio: 'New bio text',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid slug format', () => {
      const result = updateArtistSchema.safeParse({ slug: 'INVALID SLUG' });
      expect(result.success).toBe(false);
    });

    it('should accept valid slug format', () => {
      const result = updateArtistSchema.safeParse({ slug: 'valid-slug-123' });
      expect(result.success).toBe(true);
    });

    it('should reject firstName exceeding max length', () => {
      const result = updateArtistSchema.safeParse({ firstName: 'x'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('should reject invalid createdBy ObjectId', () => {
      const result = updateArtistSchema.safeParse({ createdBy: 'not-an-objectid' });
      expect(result.success).toBe(false);
    });

    it('should accept valid createdBy ObjectId', () => {
      const result = updateArtistSchema.safeParse({ createdBy: validObjectId });
      expect(result.success).toBe(true);
    });
  });

  describe('updateTrackSchema', () => {
    it('should accept an empty object', () => {
      const result = updateTrackSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept a single field update', () => {
      const result = updateTrackSchema.safeParse({ title: 'New Track Title' });
      expect(result.success).toBe(true);
    });

    it('should validate duration constraints', () => {
      expect(updateTrackSchema.safeParse({ duration: 0 }).success).toBe(false);
      expect(updateTrackSchema.safeParse({ duration: 86401 }).success).toBe(false);
      expect(updateTrackSchema.safeParse({ duration: 180 }).success).toBe(true);
    });

    it('should validate audioUrl as valid URL', () => {
      expect(updateTrackSchema.safeParse({ audioUrl: 'not-a-url' }).success).toBe(false);
      expect(
        updateTrackSchema.safeParse({ audioUrl: 'https://example.com/audio.mp3' }).success
      ).toBe(true);
    });

    it('should validate position as non-negative integer', () => {
      expect(updateTrackSchema.safeParse({ position: -1 }).success).toBe(false);
      expect(updateTrackSchema.safeParse({ position: 1.5 }).success).toBe(false);
      expect(updateTrackSchema.safeParse({ position: 0 }).success).toBe(true);
    });

    it('should reject title exceeding max length', () => {
      const result = updateTrackSchema.safeParse({ title: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('updateFeaturedArtistSchema', () => {
    it('should accept an empty object', () => {
      const result = updateFeaturedArtistSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept a single field update', () => {
      const result = updateFeaturedArtistSchema.safeParse({ displayName: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should validate position as non-negative integer', () => {
      expect(updateFeaturedArtistSchema.safeParse({ position: -1 }).success).toBe(false);
      expect(updateFeaturedArtistSchema.safeParse({ position: 0 }).success).toBe(true);
    });

    it('should validate digitalFormatId as ObjectId', () => {
      expect(updateFeaturedArtistSchema.safeParse({ digitalFormatId: 'not-valid' }).success).toBe(
        false
      );
      expect(updateFeaturedArtistSchema.safeParse({ digitalFormatId: validObjectId }).success).toBe(
        true
      );
    });

    it('should reject description exceeding max length', () => {
      const result = updateFeaturedArtistSchema.safeParse({ description: 'x'.repeat(2001) });
      expect(result.success).toBe(false);
    });
  });

  describe('updateReleaseSchema', () => {
    it('should accept an empty object (no refinement on partial)', () => {
      const result = updateReleaseSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept a single field update', () => {
      const result = updateReleaseSchema.safeParse({ title: 'Updated Album' });
      expect(result.success).toBe(true);
    });

    it('should validate coverArt as valid URL', () => {
      expect(updateReleaseSchema.safeParse({ coverArt: 'not-a-url' }).success).toBe(false);
      expect(
        updateReleaseSchema.safeParse({ coverArt: 'https://example.com/cover.jpg' }).success
      ).toBe(true);
    });

    it('should validate formats as array of valid enum values', () => {
      expect(updateReleaseSchema.safeParse({ formats: ['INVALID'] }).success).toBe(false);
      expect(updateReleaseSchema.safeParse({ formats: ['DIGITAL', 'VINYL'] }).success).toBe(true);
    });

    it('should validate artistIds as array of ObjectIds', () => {
      expect(updateReleaseSchema.safeParse({ artistIds: ['bad-id'] }).success).toBe(false);
      expect(updateReleaseSchema.safeParse({ artistIds: [validObjectId] }).success).toBe(true);
    });

    it('should not require artistIds (refinement stripped on partial)', () => {
      const result = updateReleaseSchema.safeParse({ title: 'No artists' });
      expect(result.success).toBe(true);
    });

    it('should reject title exceeding max length', () => {
      const result = updateReleaseSchema.safeParse({ title: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('should reject description exceeding max length', () => {
      const result = updateReleaseSchema.safeParse({ description: 'x'.repeat(5001) });
      expect(result.success).toBe(false);
    });
  });

  describe('updateNotificationBannerSchema', () => {
    it('should accept an empty object (no refinement on partial)', () => {
      const result = updateNotificationBannerSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept a single field update', () => {
      const result = updateNotificationBannerSchema.safeParse({
        message: 'Updated Message',
      });
      expect(result.success).toBe(true);
    });

    it('should reject message exceeding max length', () => {
      const result = updateNotificationBannerSchema.safeParse({
        message: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should validate backgroundColor as hex color', () => {
      expect(updateNotificationBannerSchema.safeParse({ backgroundColor: 'not-hex' }).success).toBe(
        false
      );
      expect(updateNotificationBannerSchema.safeParse({ backgroundColor: '#ff0000' }).success).toBe(
        true
      );
      expect(updateNotificationBannerSchema.safeParse({ backgroundColor: '#abc' }).success).toBe(
        true
      );
    });

    it('should validate imageUrl as valid URL', () => {
      expect(updateNotificationBannerSchema.safeParse({ imageUrl: 'not-a-url' }).success).toBe(
        false
      );
      expect(
        updateNotificationBannerSchema.safeParse({ imageUrl: 'https://example.com/img.jpg' })
          .success
      ).toBe(true);
    });

    it('should validate numeric range constraints', () => {
      expect(updateNotificationBannerSchema.safeParse({ messageFontSize: 0.4 }).success).toBe(
        false
      );
      expect(updateNotificationBannerSchema.safeParse({ messageFontSize: 11 }).success).toBe(false);
      expect(updateNotificationBannerSchema.safeParse({ messageFontSize: 3 }).success).toBe(true);
    });

    it('should validate percentage constraints (0-100)', () => {
      expect(updateNotificationBannerSchema.safeParse({ messageContrast: -1 }).success).toBe(false);
      expect(updateNotificationBannerSchema.safeParse({ messageContrast: 101 }).success).toBe(
        false
      );
      expect(updateNotificationBannerSchema.safeParse({ messageContrast: 50 }).success).toBe(true);
    });

    it('should validate rotation constraints (-360 to 360)', () => {
      expect(updateNotificationBannerSchema.safeParse({ messageRotation: -361 }).success).toBe(
        false
      );
      expect(updateNotificationBannerSchema.safeParse({ messageRotation: 361 }).success).toBe(
        false
      );
      expect(updateNotificationBannerSchema.safeParse({ messageRotation: 45 }).success).toBe(true);
    });

    it('should validate image offset constraints (-100 to 100)', () => {
      expect(updateNotificationBannerSchema.safeParse({ imageOffsetX: -101 }).success).toBe(false);
      expect(updateNotificationBannerSchema.safeParse({ imageOffsetX: 101 }).success).toBe(false);
      expect(updateNotificationBannerSchema.safeParse({ imageOffsetX: 50 }).success).toBe(true);
    });

    it('should not require imageUrl or backgroundColor (refinement stripped on partial)', () => {
      const result = updateNotificationBannerSchema.safeParse({ message: 'Just message' });
      expect(result.success).toBe(true);
    });

    it('should apply defaults for fields with default values', () => {
      const result = updateNotificationBannerSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.success && result.data.isOverlayed).toBe(true);
      expect(result.success && result.data.isActive).toBe(true);
      expect(result.success && result.data.messageFont).toBe('system-ui');
    });

    it('should allow overriding defaults', () => {
      const result = updateNotificationBannerSchema.safeParse({
        isActive: false,
        isOverlayed: false,
        messageFontSize: 4,
      });
      expect(result.success).toBe(true);
      expect(result.success && result.data.isActive).toBe(false);
      expect(result.success && result.data.isOverlayed).toBe(false);
      expect(result.success && result.data.messageFontSize).toBe(4);
    });

    it('should validate messageTextColor as hex color', () => {
      expect(updateNotificationBannerSchema.safeParse({ messageTextColor: 'red' }).success).toBe(
        false
      );
      expect(
        updateNotificationBannerSchema.safeParse({ messageTextColor: '#00ff00' }).success
      ).toBe(true);
    });
  });
});
