import {
  notificationBannerSchema,
  type NotificationBannerFormData,
} from './notification-banner-schema';

describe('notificationBannerSchema', () => {
  const validData: NotificationBannerFormData = {
    message: 'Test notification message',
    secondaryMessage: '',
    notes: '',
    originalImageUrl: '',
    imageUrl: 'https://example.com/image.jpg',
    linkUrl: '',
    backgroundColor: '',
    isOverlayed: true,
    isActive: true,
    displayFrom: '',
    displayUntil: '',
  };

  describe('message field', () => {
    it('should accept valid message', () => {
      const result = notificationBannerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject empty message', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        message: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Message is required');
      }
    });

    it('should reject message longer than 500 characters', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        message: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Message must be less than 500 characters');
      }
    });
  });

  describe('secondaryMessage field', () => {
    it('should accept empty secondary message', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        secondaryMessage: '',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid secondary message', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        secondaryMessage: 'Secondary message',
      });
      expect(result.success).toBe(true);
    });

    it('should reject secondary message longer than 200 characters', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        secondaryMessage: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Secondary message must be less than 200 characters'
        );
      }
    });
  });

  describe('imageUrl field', () => {
    it('should accept valid URL', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: 'https://example.com/image.png',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty string', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: '#ffffff',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('backgroundColor field', () => {
    it('should accept valid hex color with 6 digits', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: '#ffffff',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid hex color with 3 digits', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: '#fff',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty string when imageUrl is provided', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        backgroundColor: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid hex color', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: 'red',
      });
      expect(result.success).toBe(false);
    });

    it('should reject hex color without hash', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: 'ffffff',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('background requirement (imageUrl or backgroundColor)', () => {
    it('should pass when imageUrl is provided', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: 'https://example.com/image.jpg',
        backgroundColor: '',
      });
      expect(result.success).toBe(true);
    });

    it('should pass when backgroundColor is provided', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: '#000000',
      });
      expect(result.success).toBe(true);
    });

    it('should pass when both are provided', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: 'https://example.com/image.jpg',
        backgroundColor: '#000000',
      });
      expect(result.success).toBe(true);
    });

    it('should fail when neither is provided', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        imageUrl: '',
        backgroundColor: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Either an image URL or a background color is required'
        );
      }
    });
  });

  describe('linkUrl field', () => {
    it('should accept valid URL', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        linkUrl: 'https://example.com/page',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty string', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        linkUrl: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        linkUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('boolean fields', () => {
    it('should accept isOverlayed as true', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        isOverlayed: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept isOverlayed as false', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        isOverlayed: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive as true', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        isActive: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive as false', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        isActive: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('date fields', () => {
    it('should accept valid displayFrom date string', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        displayFrom: '2024-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid displayUntil date string', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        displayUntil: '2024-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty date strings', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        displayFrom: '',
        displayUntil: '',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('notes field', () => {
    it('should accept valid notes', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        notes: 'Internal notes for admins',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty notes', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        notes: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject notes longer than 1000 characters', () => {
      const result = notificationBannerSchema.safeParse({
        ...validData,
        notes: 'a'.repeat(1001),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Notes must be less than 1000 characters');
      }
    });
  });
});
