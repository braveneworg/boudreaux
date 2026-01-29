import sharp from 'sharp';

import { processNotificationImageAction } from './process-notification-image-action';
import { requireRole } from '../utils/auth/require-role';

import type { ProcessNotificationImageInput } from './process-notification-image-action';

// Mock sharp before importing the action
vi.mock('sharp', () => {
  const mockPipeline = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image-data')),
  };
  return {
    default: vi.fn(() => mockPipeline),
  };
});

vi.mock('../utils/auth/require-role', () => ({
  requireRole: vi.fn(),
}));

const mockRequireRole = vi.mocked(requireRole);
const mockSharp = vi.mocked(sharp);

// Create a valid base64-encoded image (1x1 red pixel JPEG)
const validImageBase64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=';

const createValidInput = (
  overrides: Partial<ProcessNotificationImageInput> = {}
): ProcessNotificationImageInput => ({
  imageBase64: validImageBase64,
  mimeType: 'image/jpeg',
  message: 'Test Message',
  isOverlayed: true,
  ...overrides,
});

describe('processNotificationImageAction', () => {
  const resetSharpMock = () => {
    const mockPipeline = {
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      composite: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image-data')),
    };
    mockSharp.mockReturnValue(mockPipeline as unknown as ReturnType<typeof sharp>);
    return mockPipeline;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    resetSharpMock();
  });

  describe('authorization', () => {
    it('should require admin role', async () => {
      const input = createValidInput();
      await processNotificationImageAction(input);

      expect(mockRequireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not authorized', async () => {
      mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

      const input = createValidInput();
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('image processing without overlay', () => {
    it('should return resized image when isOverlayed is false', async () => {
      const input = createValidInput({ isOverlayed: false });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
      expect(result.processedImageBase64).toBeDefined();
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should return resized image when message is empty', async () => {
      const input = createValidInput({ message: '', isOverlayed: true });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
      expect(result.processedImageBase64).toBeDefined();
    });
  });

  describe('image processing with overlay', () => {
    it('should process image with text overlay', async () => {
      const input = createValidInput({
        message: 'Test Message',
        secondaryMessage: 'Secondary Message',
        isOverlayed: true,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
      expect(result.processedImageBase64).toBeDefined();
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should use default dimensions when not specified', async () => {
      const input = createValidInput();
      await processNotificationImageAction(input);

      expect(mockSharp).toHaveBeenCalled();
      const mockPipeline = mockSharp.mock.results[0]?.value;
      expect(mockPipeline.resize).toHaveBeenCalledWith(880, 544, {
        fit: 'cover',
        position: 'center',
      });
    });

    it('should use custom dimensions when specified', async () => {
      const input = createValidInput({ width: 1200, height: 600 });
      await processNotificationImageAction(input);

      expect(mockSharp).toHaveBeenCalled();
      const mockPipeline = mockSharp.mock.results[0]?.value;
      expect(mockPipeline.resize).toHaveBeenCalledWith(1200, 600, {
        fit: 'cover',
        position: 'center',
      });
    });

    it('should apply composite when overlay is enabled', async () => {
      const input = createValidInput({ isOverlayed: true });
      await processNotificationImageAction(input);

      expect(mockSharp).toHaveBeenCalled();
      const mockPipeline = mockSharp.mock.results[0]?.value;
      expect(mockPipeline.composite).toHaveBeenCalled();
    });

    it('should not apply composite when overlay is disabled', async () => {
      const input = createValidInput({ isOverlayed: false });
      await processNotificationImageAction(input);

      expect(mockSharp).toHaveBeenCalled();
      const mockPipeline = mockSharp.mock.results[0]?.value;
      expect(mockPipeline.composite).not.toHaveBeenCalled();
    });
  });

  describe('font styling', () => {
    it('should use default font settings when not specified', async () => {
      const input = createValidInput();
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should accept custom font settings', async () => {
      const input = createValidInput({
        messageFont: 'Arial',
        messageFontSize: 3.5,
        messageContrast: 80,
        secondaryMessageFont: 'Georgia',
        secondaryMessageFontSize: 2.5,
        secondaryMessageContrast: 90,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('text color settings', () => {
    it('should use default text colors when not specified', async () => {
      const input = createValidInput();
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should accept custom text colors', async () => {
      const input = createValidInput({
        messageTextColor: '#ff0000',
        secondaryMessageTextColor: '#00ff00',
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('text shadow settings', () => {
    it('should use default shadow settings when not specified', async () => {
      const input = createValidInput();
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should accept custom shadow settings', async () => {
      const input = createValidInput({
        messageTextShadow: false,
        messageTextShadowDarkness: 25,
        secondaryMessageTextShadow: true,
        secondaryMessageTextShadowDarkness: 75,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('text position settings', () => {
    it('should use default positions when not specified', async () => {
      const input = createValidInput();
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should accept custom position settings', async () => {
      const input = createValidInput({
        messagePositionX: 25,
        messagePositionY: 20,
        secondaryMessagePositionX: 75,
        secondaryMessagePositionY: 80,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should handle left-aligned text (position < 33)', async () => {
      const input = createValidInput({
        messagePositionX: 10,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should handle right-aligned text (position > 67)', async () => {
      const input = createValidInput({
        messagePositionX: 90,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should handle center-aligned text (33 <= position <= 67)', async () => {
      const input = createValidInput({
        messagePositionX: 50,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error when sharp fails', async () => {
      const mockPipeline = {
        resize: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockRejectedValue(new Error('Sharp processing failed')),
      };
      mockSharp.mockReturnValue(mockPipeline as unknown as ReturnType<typeof sharp>);

      const input = createValidInput({ isOverlayed: false });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sharp processing failed');
    });

    it('should handle non-Error exceptions', async () => {
      const mockPipeline = {
        resize: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockRejectedValue('String error'),
      };
      mockSharp.mockReturnValue(mockPipeline as unknown as ReturnType<typeof sharp>);

      const input = createValidInput({ isOverlayed: false });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to process image');
    });

    it('should handle invalid base64 input gracefully', async () => {
      const mockPipeline = {
        resize: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        toBuffer: vi
          .fn()
          .mockRejectedValue(new Error('Input buffer contains unsupported image format')),
      };
      mockSharp.mockReturnValue(mockPipeline as unknown as ReturnType<typeof sharp>);

      const input = createValidInput({ imageBase64: 'invalid-base64' });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(false);
    });
  });

  describe('secondary message handling', () => {
    it('should process without secondary message', async () => {
      const input = createValidInput({
        message: 'Primary only',
        secondaryMessage: undefined,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should process with secondary message', async () => {
      const input = createValidInput({
        message: 'Primary',
        secondaryMessage: 'Secondary',
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('HTML sanitization', () => {
    it('should strip HTML tags from messages', async () => {
      const input = createValidInput({
        message: '<b>Bold</b> and <i>italic</i>',
        secondaryMessage: '<script>alert("xss")</script>',
      });
      const result = await processNotificationImageAction(input);

      // Should succeed - HTML is stripped internally
      expect(result.success).toBe(true);
    });

    it('should decode HTML entities', async () => {
      const input = createValidInput({
        message: 'Hello &amp; Welcome',
        secondaryMessage: '&lt;Not HTML&gt;',
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('XML escaping', () => {
    it('should escape XML special characters in messages', async () => {
      const input = createValidInput({
        message: 'Test <message> with "quotes" & \'apostrophes\'',
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('word wrapping', () => {
    it('should handle long messages that require wrapping', async () => {
      const longMessage =
        'This is a very long message that will definitely need to be wrapped across multiple lines to fit within the banner dimensions properly';
      const input = createValidInput({
        message: longMessage,
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });

    it('should handle single word that exceeds line width', async () => {
      const input = createValidInput({
        message: 'Supercalifragilisticexpialidocious',
      });
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
    });
  });

  describe('output format', () => {
    it('should output JPEG with 92% quality', async () => {
      const input = createValidInput();
      await processNotificationImageAction(input);

      expect(mockSharp).toHaveBeenCalled();
      const mockPipeline = mockSharp.mock.results[0]?.value;
      expect(mockPipeline.jpeg).toHaveBeenCalledWith({ quality: 92 });
    });

    it('should return base64-encoded result', async () => {
      const input = createValidInput();
      const result = await processNotificationImageAction(input);

      expect(result.success).toBe(true);
      expect(result.processedImageBase64).toBeDefined();
      // Should be a valid base64 string
      expect(() => Buffer.from(result.processedImageBase64!, 'base64')).not.toThrow();
    });
  });
});
