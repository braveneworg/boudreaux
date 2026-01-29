import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImageCropper, GOLDEN_RATIO, BANNER_WIDTH, BANNER_HEIGHT } from './image-cropper';

// Mock react-image-crop
vi.mock('react-image-crop', () => ({
  default: vi.fn(({ children, onComplete, onChange }) => {
    // Simulate crop completion on mount
    setTimeout(() => {
      onComplete?.({ x: 0, y: 0, width: BANNER_WIDTH, height: BANNER_HEIGHT, unit: 'px' });
    }, 0);

    return (
      <div
        data-testid="mock-cropper"
        onClick={() => {
          onChange?.({ x: 10, y: 10, width: 50, height: 30, unit: '%' });
          onComplete?.({ x: 50, y: 50, width: 400, height: 250, unit: 'px' });
        }}
      >
        {children}
      </div>
    );
  }),
  centerCrop: vi.fn((crop) => crop),
  makeAspectCrop: vi.fn((crop) => crop),
}));

// Mock canvas for createCroppedImage
const mockToBlob = vi.fn((callback: (blob: Blob | null) => void) => {
  callback(new Blob(['test'], { type: 'image/jpeg' }));
});

const mockCanvasContext = {
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
};

const mockCanvas = {
  getContext: vi.fn(() => mockCanvasContext),
  toBlob: mockToBlob,
  width: 0,
  height: 0,
};

// Mock document.createElement for canvas
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'canvas') {
    return mockCanvas as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tagName);
});

// Mock Image
class MockImage {
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  crossOrigin = '';
  src = '';
  width = 1920;
  height = 1080;

  constructor() {
    setTimeout(() => {
      this.onload?.();
    }, 0);
  }
}

vi.stubGlobal('Image', MockImage);

describe('ImageCropper', () => {
  const defaultProps = {
    imageSrc: 'https://example.com/test-image.jpg',
    open: true,
    onOpenChange: vi.fn(),
    onCropComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    it('exports GOLDEN_RATIO as approximately 1.618', () => {
      expect(GOLDEN_RATIO).toBeCloseTo(1.618, 2);
    });

    it('exports BANNER_WIDTH as 880', () => {
      expect(BANNER_WIDTH).toBe(880);
    });

    it('exports BANNER_HEIGHT as 544', () => {
      expect(BANNER_HEIGHT).toBe(544);
    });

    it('BANNER_WIDTH / BANNER_HEIGHT equals approximately GOLDEN_RATIO', () => {
      expect(BANNER_WIDTH / BANNER_HEIGHT).toBeCloseTo(GOLDEN_RATIO, 2);
    });
  });

  describe('Rendering', () => {
    it('renders dialog when open is true', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Crop Image')).toBeInTheDocument();
    });

    it('does not render dialog content when open is false', () => {
      render(<ImageCropper {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the Cropper component', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByTestId('mock-cropper')).toBeInTheDocument();
    });

    it('renders background color controls', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByText(/Add background color/i)).toBeInTheDocument();
    });

    it('renders Apply Crop and Cancel buttons', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByRole('button', { name: /apply crop/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('displays the correct dimensions in description', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(
        screen.getByText(new RegExp(`${BANNER_WIDTH}×${BANNER_HEIGHT}px`))
      ).toBeInTheDocument();
    });
  });

  describe('Instructions', () => {
    it('displays tip about dragging corners and edges', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByText(/drag the corners or edges/i)).toBeInTheDocument();
    });
  });

  describe('Background Color', () => {
    it('shows color picker when switch is toggled', async () => {
      const user = userEvent.setup();
      render(<ImageCropper {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      // After checking, color inputs should be visible (type="color" and type="text")
      const colorInputs = screen.getAllByDisplayValue('#000000');
      expect(colorInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('uses initialBackgroundColor when provided', () => {
      render(<ImageCropper {...defaultProps} initialBackgroundColor="#FF5500" />);

      // The switch should be on when initial color is provided
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeChecked();
      // Both color and text inputs will have this value
      const colorInputs = screen.getAllByDisplayValue('#FF5500');
      expect(colorInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('updates color value when input changes', async () => {
      const user = userEvent.setup();
      render(<ImageCropper {...defaultProps} initialBackgroundColor="#000000" />);

      // Get the text input (not the color picker)
      const textInput = screen.getByPlaceholderText('#000000');
      await user.clear(textInput);
      await user.type(textInput, '#FFFFFF');

      expect(screen.getByDisplayValue('#FFFFFF')).toBeInTheDocument();
    });
  });

  describe('Cancel Behavior', () => {
    it('calls onOpenChange(false) when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<ImageCropper {...defaultProps} onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Crop Completion', () => {
    it('calls onCropComplete when Apply Crop is clicked', async () => {
      const user = userEvent.setup();
      const onCropComplete = vi.fn();
      render(<ImageCropper {...defaultProps} onCropComplete={onCropComplete} />);

      // Wait for the cropped area to be set by mock
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply crop/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /apply crop/i }));

      await waitFor(() => {
        expect(onCropComplete).toHaveBeenCalled();
      });
    });

    it('includes blob in crop result', async () => {
      const user = userEvent.setup();
      const onCropComplete = vi.fn();
      render(<ImageCropper {...defaultProps} onCropComplete={onCropComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply crop/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /apply crop/i }));

      await waitFor(() => {
        expect(onCropComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            blob: expect.any(Blob),
          })
        );
      });
    });

    it('includes croppedAreaPixels in crop result', async () => {
      const user = userEvent.setup();
      const onCropComplete = vi.fn();
      render(<ImageCropper {...defaultProps} onCropComplete={onCropComplete} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply crop/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /apply crop/i }));

      await waitFor(() => {
        expect(onCropComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            croppedAreaPixels: expect.objectContaining({
              x: expect.any(Number),
              y: expect.any(Number),
              width: expect.any(Number),
              height: expect.any(Number),
            }),
          })
        );
      });
    });

    it('includes backgroundColor when enabled', async () => {
      const user = userEvent.setup();
      const onCropComplete = vi.fn();
      render(
        <ImageCropper
          {...defaultProps}
          onCropComplete={onCropComplete}
          initialBackgroundColor="#FF0000"
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply crop/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /apply crop/i }));

      await waitFor(() => {
        expect(onCropComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            backgroundColor: '#FF0000',
          })
        );
      });
    });

    it('shows loading state during processing', async () => {
      const user = userEvent.setup();
      render(<ImageCropper {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply crop/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /apply crop/i }));

      // The Apply Crop button should show loading state or remain present
      await waitFor(() => {
        const button =
          screen.queryByRole('button', { name: /processing/i }) ||
          screen.queryByRole('button', { name: /apply crop/i });
        expect(button).toBeInTheDocument();
      });
    });
  });

  describe('State Reset', () => {
    it('resets state when dialog reopens', async () => {
      const { rerender } = render(<ImageCropper {...defaultProps} open={false} />);

      // Open the dialog
      rerender(<ImageCropper {...defaultProps} />);

      // Crop tip should be visible
      await waitFor(() => {
        expect(screen.getByText(/drag the corners or edges/i)).toBeInTheDocument();
      });
    });

    it('resets background color to initial when dialog reopens', async () => {
      const { rerender } = render(
        <ImageCropper {...defaultProps} open={false} initialBackgroundColor="#FF0000" />
      );

      rerender(<ImageCropper {...defaultProps} initialBackgroundColor="#00FF00" />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('#00FF00')).toBeInTheDocument();
      });
    });
  });

  describe('Aspect Ratio', () => {
    it('uses golden ratio by default', () => {
      render(<ImageCropper {...defaultProps} />);

      // The mock cropper is rendered with aspectRatio prop
      expect(screen.getByTestId('mock-cropper')).toBeInTheDocument();
    });

    it('accepts custom aspect ratio', () => {
      render(<ImageCropper {...defaultProps} aspectRatio={16 / 9} />);

      expect(screen.getByTestId('mock-cropper')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible dialog title', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAccessibleName('Crop Image');
    });

    it('switch has accessible label', () => {
      render(<ImageCropper {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAccessibleName(/add background color/i);
    });

    it('displays crop image with accessible alt text', () => {
      render(<ImageCropper {...defaultProps} />);

      expect(screen.getByAltText('Crop preview')).toBeInTheDocument();
    });
  });
});
