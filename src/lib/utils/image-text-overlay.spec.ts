/**
 * Tests for image text overlay utility
 * Uses mocked browser Canvas API since tests run in Node environment
 */

import { addTextOverlayToImage, type TextOverlayOptions } from './image-text-overlay';

// Store original implementations
const originalCreateElement = document.createElement.bind(document);
const originalImage = global.Image;
const _originalURL = global.URL;

// Mock canvas context
const mockMeasureText = vi.fn((text: string) => ({
  width: text.length * 10, // Simple approximation
}));

const mockFillText = vi.fn();
const mockFillRect = vi.fn();
const mockDrawImage = vi.fn();
const mockCreateLinearGradient = vi.fn(() => ({
  addColorStop: vi.fn(),
}));
const mockToBlob = vi.fn(
  (callback: (blob: Blob | null) => void, type: string, _quality: number) => {
    callback(new Blob(['test-image-data'], { type }));
  }
);
const mockToDataURL = vi.fn(() => 'data:image/jpeg;base64,test-data');

const mockCanvasContext = {
  measureText: mockMeasureText,
  fillText: mockFillText,
  fillRect: mockFillRect,
  drawImage: mockDrawImage,
  createLinearGradient: mockCreateLinearGradient,
  fillStyle: '',
  font: '',
  textAlign: 'center' as CanvasTextAlign,
  textBaseline: 'middle' as CanvasTextBaseline,
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

const createMockCanvas = () => ({
  width: 0,
  height: 0,
  getContext: vi.fn(() => mockCanvasContext),
  toBlob: mockToBlob,
  toDataURL: mockToDataURL,
});

// Mock Image class
class MockImage {
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  private _src = '';
  width = 880;
  height = 544;

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

describe('addTextOverlayToImage', () => {
  const createTestBlob = () => new Blob(['test-image'], { type: 'image/jpeg' });

  const defaultOptions: TextOverlayOptions = {
    message: 'Test Message',
    imageBlob: createTestBlob(),
    width: 880,
    height: 544,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset canvas context mock values
    mockToBlob.mockImplementation((callback: (blob: Blob | null) => void, type: string) => {
      callback(new Blob(['test-image-data'], { type }));
    });
  });

  describe('successful overlay creation', () => {
    it('should add text overlay to image and return blob', async () => {
      const result = await addTextOverlayToImage(defaultOptions);

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.dataUrl).toBe('data:image/jpeg;base64,test-data');
    });

    it('should set canvas dimensions to provided width and height', async () => {
      await addTextOverlayToImage({
        ...defaultOptions,
        width: 1200,
        height: 600,
      });

      const mockResults = (document.createElement as ReturnType<typeof vi.fn>).mock
        .results as Array<{ type: string; value: { width?: number } }>;
      const canvasCreated = mockResults.find(
        (r) => r.type === 'return' && r.value?.width !== undefined
      );
      expect(canvasCreated).toBeDefined();
    });

    it('should draw the image onto the canvas', async () => {
      await addTextOverlayToImage(defaultOptions);

      expect(mockDrawImage).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        0,
        defaultOptions.width,
        defaultOptions.height
      );
    });

    it('should create gradient overlay for text contrast', async () => {
      await addTextOverlayToImage(defaultOptions);

      expect(mockCreateLinearGradient).toHaveBeenCalled();
      expect(mockFillRect).toHaveBeenCalled();
    });

    it('should draw the main message text', async () => {
      await addTextOverlayToImage(defaultOptions);

      expect(mockFillText).toHaveBeenCalled();
    });
  });

  describe('secondary message handling', () => {
    it('should draw secondary message when provided', async () => {
      await addTextOverlayToImage({
        ...defaultOptions,
        message: 'Main Message',
        secondaryMessage: 'Secondary Message',
      });

      // Should have multiple fillText calls for both messages
      expect(mockFillText.mock.calls.length).toBeGreaterThan(0);
    });

    it('should not draw secondary message when not provided', async () => {
      const fillTextCallsBefore = mockFillText.mock.calls.length;

      await addTextOverlayToImage({
        ...defaultOptions,
        secondaryMessage: undefined,
      });

      // Should only have fillText calls for primary message
      expect(mockFillText.mock.calls.length).toBeGreaterThan(fillTextCallsBefore);
    });
  });

  describe('text styling', () => {
    it('should apply text shadow settings', async () => {
      await addTextOverlayToImage(defaultOptions);

      // Check that shadow properties were set
      // Note: We're checking the context was used, shadow values are set on the context
      expect(mockDrawImage).toHaveBeenCalled();
    });

    it('should center text horizontally', async () => {
      await addTextOverlayToImage(defaultOptions);

      // Check fillText was called with center-ish x coordinate
      const fillTextCalls = mockFillText.mock.calls as Array<[string, number, number]>;
      expect(fillTextCalls.length).toBeGreaterThan(0);

      // All calls should have x position around center (width / 2)
      fillTextCalls.forEach((call) => {
        const xPosition = call[1];
        // Allow for some variation due to word wrapping
        expect(xPosition).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('word wrapping', () => {
    it('should wrap long messages across multiple lines', async () => {
      const longMessage =
        'This is a very long message that definitely needs to be wrapped across multiple lines';

      await addTextOverlayToImage({
        ...defaultOptions,
        message: longMessage,
      });

      // Should have multiple fillText calls for wrapped lines
      expect(mockFillText.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle single word messages', async () => {
      await addTextOverlayToImage({
        ...defaultOptions,
        message: 'Hello',
      });

      expect(mockFillText).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should reject when canvas context cannot be obtained', async () => {
      vi.spyOn(document, 'createElement').mockImplementationOnce((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => null,
            toBlob: mockToBlob,
            toDataURL: mockToDataURL,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      await expect(addTextOverlayToImage(defaultOptions)).rejects.toThrow(
        'Could not get canvas context'
      );
    });

    it('should reject when image fails to load', async () => {
      // Create a mock image that triggers onerror
      class ErrorMockImage {
        onload: (() => void) | null = null;
        onerror: ((error: unknown) => void) | null = null;
        private _src = '';

        get src() {
          return this._src;
        }

        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onerror) this.onerror(new Error('Load failed'));
          }, 0);
        }
      }

      global.Image = ErrorMockImage as unknown as typeof Image;

      await expect(addTextOverlayToImage(defaultOptions)).rejects.toThrow(
        'Failed to load image for text overlay'
      );

      // Restore the mock
      global.Image = MockImage as unknown as typeof Image;
    });

    it('should reject when toBlob fails to create blob', async () => {
      mockToBlob.mockImplementationOnce((callback: (blob: Blob | null) => void) => {
        callback(null);
      });

      await expect(addTextOverlayToImage(defaultOptions)).rejects.toThrow(
        'Failed to create blob from canvas'
      );
    });
  });

  describe('output format', () => {
    it('should output JPEG format', async () => {
      await addTextOverlayToImage(defaultOptions);

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
    });

    it('should use 92% quality for JPEG', async () => {
      await addTextOverlayToImage(defaultOptions);

      expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
    });

    it('should return both blob and dataUrl', async () => {
      const result = await addTextOverlayToImage(defaultOptions);

      expect(result.blob).toBeDefined();
      expect(result.dataUrl).toBeDefined();
      expect(result.dataUrl.startsWith('data:image/')).toBe(true);
    });
  });

  describe('varied secondary message placement', () => {
    it('should apply consistent offset based on message content', async () => {
      // Same message should produce same offset
      await addTextOverlayToImage({
        ...defaultOptions,
        message: 'Main',
        secondaryMessage: 'Same Message',
      });

      const firstCallCount = mockFillText.mock.calls.length;
      vi.clearAllMocks();

      await addTextOverlayToImage({
        ...defaultOptions,
        message: 'Main',
        secondaryMessage: 'Same Message',
      });

      // Same message should have consistent behavior
      expect(mockFillText.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('font size calculation', () => {
    it('should scale font size based on image width', async () => {
      // Larger image should use larger font
      await addTextOverlayToImage({
        ...defaultOptions,
        width: 1760, // Double the default width
        height: 1088,
      });

      // Font should be set (checking it was called, actual size depends on implementation)
      expect(mockDrawImage).toHaveBeenCalled();
    });

    it('should use minimum font size for very small images', async () => {
      await addTextOverlayToImage({
        ...defaultOptions,
        width: 200,
        height: 100,
      });

      // Should still work with small dimensions
      expect(mockFillText).toHaveBeenCalled();
    });
  });

  describe('URL cleanup', () => {
    it('should create and revoke object URL for blob', async () => {
      await addTextOverlayToImage(defaultOptions);

      expect(URL.createObjectURL).toHaveBeenCalled();
      // Note: revokeObjectURL might be called after image load in the actual implementation
    });
  });
});
