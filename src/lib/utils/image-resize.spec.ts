/**
 * Tests for image resize utility
 * Note: These tests use mocked browser APIs since they run in a Node environment
 */

import { resizeImage, resizeNotificationBannerImage } from './image-resize';

// Store original implementations
const originalCreateElement = document.createElement.bind(document);
const originalImage = global.Image;

// Mock Image dimensions
let mockImageWidth = 1920;
let mockImageHeight = 1080;

// Mock Image class that uses module-level width/height
class MockImage {
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  private _src = '';

  get naturalWidth() {
    return mockImageWidth;
  }

  get naturalHeight() {
    return mockImageHeight;
  }

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    // Trigger onload asynchronously
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }
}

// Mock canvas
const mockDrawImage = vi.fn();
const mockToBlob = vi.fn((callback: (blob: Blob | null) => void, type: string) => {
  callback(new Blob(['test'], { type }));
});
const mockGetContext = vi.fn(() => ({
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'high',
  drawImage: mockDrawImage,
}));

const createMockCanvas = () => ({
  width: 0,
  height: 0,
  getContext: mockGetContext,
  toBlob: mockToBlob,
});

// Setup mocks
beforeAll(() => {
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return createMockCanvas() as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tagName);
  });

  global.Image = MockImage as unknown as typeof Image;

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
  global.Image = originalImage;
});

describe('image-resize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock image dimensions
    mockImageWidth = 1920;
    mockImageHeight = 1080;
  });

  describe('resizeImage', () => {
    it('should resize image larger than maxWidth', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const result = await resizeImage(file, { maxWidth: 880 });

      expect(result.originalWidth).toBe(1920);
      expect(result.originalHeight).toBe(1080);
      expect(result.newWidth).toBe(880);
      expect(result.wasResized).toBe(true);
      // Height should maintain aspect ratio: 1080 * (880/1920) ≈ 495
      expect(result.newHeight).toBe(Math.round(1080 * (880 / 1920)));
    });

    it('should not resize image smaller than maxWidth', async () => {
      mockImageWidth = 800;
      mockImageHeight = 600;

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const result = await resizeImage(file, { maxWidth: 880 });

      expect(result.originalWidth).toBe(800);
      expect(result.originalHeight).toBe(600);
      expect(result.newWidth).toBe(800);
      expect(result.newHeight).toBe(600);
      expect(result.wasResized).toBe(false);
      // Should return original file when not resized
      expect(result.file).toBe(file);
    });

    it('should respect maxHeight constraint', async () => {
      mockImageWidth = 2000;
      mockImageHeight = 2000;

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const result = await resizeImage(file, { maxWidth: 1000, maxHeight: 500 });

      expect(result.wasResized).toBe(true);
      // First resize to width: 2000 -> 1000, height: 2000 -> 1000
      // Then apply height constraint: height 1000 -> 500, width 1000 -> 500
      expect(result.newHeight).toBeLessThanOrEqual(500);
    });

    it('should use default quality of 0.9', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await resizeImage(file, { maxWidth: 880 });

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    });

    it('should support custom quality', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await resizeImage(file, { maxWidth: 880, quality: 0.7 });

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.7);
    });

    it('should convert format when specified', async () => {
      const file = new File(['test'], 'test.png', { type: 'image/png' });

      await resizeImage(file, { maxWidth: 880, format: 'image/webp' });

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
    });

    it('should preserve PNG format by default', async () => {
      mockImageWidth = 2000;
      mockImageHeight = 1000;

      const file = new File(['test'], 'test.png', { type: 'image/png' });

      await resizeImage(file, { maxWidth: 880 });

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.9);
    });

    it('should preserve WebP format by default', async () => {
      mockImageWidth = 2000;
      mockImageHeight = 1000;

      const file = new File(['test'], 'test.webp', { type: 'image/webp' });

      await resizeImage(file, { maxWidth: 880 });

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
    });

    it('should convert GIF to JPEG by default', async () => {
      mockImageWidth = 2000;
      mockImageHeight = 1000;

      const file = new File(['test'], 'test.gif', { type: 'image/gif' });

      await resizeImage(file, { maxWidth: 880 });

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    });

    it('should generate correct filename with dimensions', async () => {
      const file = new File(['test'], 'my-banner.jpg', { type: 'image/jpeg' });

      const result = await resizeImage(file, { maxWidth: 880 });

      expect(result.file.name).toBe('my-banner-880w.jpg');
    });

    it('should clean up object URL after loading', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await resizeImage(file, { maxWidth: 880 });

      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('resizeNotificationBannerImage', () => {
    it('should resize to 880px width', async () => {
      const file = new File(['test'], 'banner.jpg', { type: 'image/jpeg' });

      const result = await resizeNotificationBannerImage(file);

      expect(result.newWidth).toBe(880);
      expect(result.wasResized).toBe(true);
    });

    it('should convert to JPEG format', async () => {
      const file = new File(['test'], 'banner.png', { type: 'image/png' });

      await resizeNotificationBannerImage(file);

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    });

    it('should not resize images already 880px or smaller', async () => {
      mockImageWidth = 880;
      mockImageHeight = 544;

      const file = new File(['test'], 'banner.jpg', { type: 'image/jpeg' });

      const result = await resizeNotificationBannerImage(file);

      expect(result.wasResized).toBe(false);
      expect(result.file).toBe(file);
    });
  });
});
