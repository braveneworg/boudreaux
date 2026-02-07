import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TrackPlayButton } from './track-play-button';

// Store mock audio element's event listeners so we can trigger them
interface MockAudioElement {
  src: string;
  preload: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  listeners: Record<string, Array<(e: Event) => void>>;
  addEventListener: (event: string, handler: (e: Event) => void) => void;
  removeEventListener: (event: string, handler: (e: Event) => void) => void;
  dispatchMockEvent: (event: string, eventObj?: Event) => void;
}

let mockAudioElement: MockAudioElement;

// Track window event listeners
const windowListeners: Record<string, Array<(e: Event) => void>> = {};

// Create mock audio element factory
function createMockAudioElement(): MockAudioElement {
  return {
    src: '',
    preload: '',
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    listeners: {},
    addEventListener(event: string, handler: (e: Event) => void) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(handler);
    },
    removeEventListener(event: string, handler: (e: Event) => void) {
      if (this.listeners[event]) {
        const index = this.listeners[event].indexOf(handler);
        if (index > -1) {
          this.listeners[event].splice(index, 1);
        }
      }
    },
    dispatchMockEvent(event: string, eventObj?: Event) {
      if (this.listeners[event]) {
        const e = eventObj || new Event(event);
        this.listeners[event].forEach((handler) => handler(e));
      }
    },
  };
}

// Create mock Audio class
class MockAudio {
  src = '';
  preload = '';
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  listeners: Record<string, Array<(e: Event) => void>> = {};

  constructor() {
    // Store reference to this instance
    mockAudioElement = this as unknown as MockAudioElement;
    mockAudioElement.dispatchMockEvent = (event: string, eventObj?: Event) => {
      if (this.listeners[event]) {
        const e = eventObj || new Event(event);
        this.listeners[event].forEach((handler) => handler(e));
      }
    };
  }

  addEventListener(event: string, handler: (e: Event) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (e: Event) => void) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(handler);
      if (index > -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }
}

// Replace global Audio with our mock class
global.Audio = MockAudio as unknown as typeof Audio;

beforeEach(() => {
  mockAudioElement = createMockAudioElement();

  // Mock window event listeners
  const originalAddEventListener = window.addEventListener.bind(window);
  const originalRemoveEventListener = window.removeEventListener.bind(window);

  vi.spyOn(window, 'addEventListener').mockImplementation(
    (event: string, handler: ((e: Event) => void) | { handleEvent: (e: Event) => void }) => {
      if (!windowListeners[event]) {
        windowListeners[event] = [];
      }
      const fn = typeof handler === 'function' ? handler : handler.handleEvent;
      windowListeners[event].push(fn);
      originalAddEventListener(event, handler);
    }
  );

  vi.spyOn(window, 'removeEventListener').mockImplementation(
    (event: string, handler: ((e: Event) => void) | { handleEvent: (e: Event) => void }) => {
      if (windowListeners[event]) {
        const fn = typeof handler === 'function' ? handler : handler.handleEvent;
        const index = windowListeners[event].indexOf(fn);
        if (index > -1) {
          windowListeners[event].splice(index, 1);
        }
      }
      originalRemoveEventListener(event, handler);
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.keys(windowListeners).forEach((key) => {
    windowListeners[key] = [];
  });
});

describe('TrackPlayButton', () => {
  const validAudioUrl = 'https://cdn.example.com/audio/track.mp3';

  describe('rendering', () => {
    it('should render play button when audioUrl is provided', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button', { name: /play/i });
      expect(button).toBeInTheDocument();
    });

    it('should not render when audioUrl is empty', () => {
      const { container } = render(<TrackPlayButton audioUrl="" />);

      expect(container.firstChild).toBeNull();
    });

    it('should not render when audioUrl starts with pending://', () => {
      const { container } = render(<TrackPlayButton audioUrl="pending://track-123" />);

      expect(container.firstChild).toBeNull();
    });

    it('should render with custom className', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should render with default icon size', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toHaveClass('h-4', 'w-4');
    });

    it('should render with small icon size', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} size="sm" />);

      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toHaveClass('h-3', 'w-3');
    });

    it('should render with large icon size', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} size="lg" />);

      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toHaveClass('h-5', 'w-5');
    });

    it('should render with outline variant and border styling', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border-2', 'border-zinc-900');
    });

    it('should have aria-label title for accessibility', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Play');
    });

    it('should have type button to prevent form submission', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });
  });

  describe('audio initialization', () => {
    it('should create Audio element on mount', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Verify that an Audio element was created by checking that mockAudioElement was set
      expect(mockAudioElement).toBeDefined();
      expect(mockAudioElement.listeners).toBeDefined();
    });

    it('should set audio preload to none', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      expect(mockAudioElement.preload).toBe('none');
    });

    it('should add all required event listeners', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      expect(mockAudioElement.listeners['play']).toBeDefined();
      expect(mockAudioElement.listeners['pause']).toBeDefined();
      expect(mockAudioElement.listeners['ended']).toBeDefined();
      expect(mockAudioElement.listeners['error']).toBeDefined();
      expect(mockAudioElement.listeners['canplay']).toBeDefined();
      expect(mockAudioElement.listeners['loadstart']).toBeDefined();
    });

    it('should cleanup audio element on unmount', () => {
      const { unmount } = render(<TrackPlayButton audioUrl={validAudioUrl} />);

      unmount();

      expect(mockAudioElement.pause).toHaveBeenCalled();
      expect(mockAudioElement.src).toBe('');
    });
  });

  describe('playback controls', () => {
    it('should start playback when button is clicked', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button', { name: /play/i });
      await user.click(button);

      expect(mockAudioElement.src).toBe(validAudioUrl);
      expect(mockAudioElement.play).toHaveBeenCalled();
    });

    it('should show pause icon when playing', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button', { name: /play/i });
      await user.click(button);

      // Simulate play event
      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      await waitFor(() => {
        expect(button).toHaveAttribute('title', 'Pause');
      });
    });

    it('should pause when clicked while playing', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');

      // Play
      await user.click(button);
      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      // Pause
      await user.click(button);

      expect(mockAudioElement.pause).toHaveBeenCalled();
    });

    it('should show play icon after track ends', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');

      // Start playing
      await user.click(button);
      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      // Track ends
      act(() => {
        mockAudioElement.dispatchMockEvent('ended');
      });

      await waitFor(() => {
        expect(button).toHaveAttribute('title', 'Play');
      });
    });

    it('should show play icon after pause', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');

      // Start playing
      await user.click(button);
      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      // Pause event
      act(() => {
        mockAudioElement.dispatchMockEvent('pause');
      });

      await waitFor(() => {
        expect(button).toHaveAttribute('title', 'Play');
      });
    });
  });

  describe('loading state', () => {
    it('should show loading state when audio is loading', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      await user.click(button);

      // Trigger loadstart
      act(() => {
        mockAudioElement.dispatchMockEvent('loadstart');
      });

      await waitFor(() => {
        expect(button).toBeDisabled();
      });
    });

    it('should enable button when audio can play', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      await user.click(button);

      // Loading starts
      act(() => {
        mockAudioElement.dispatchMockEvent('loadstart');
      });

      // Can play now
      act(() => {
        mockAudioElement.dispatchMockEvent('canplay');
      });

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('error handling', () => {
    it('should handle audio errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      await user.click(button);

      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      // Simulate error
      act(() => {
        mockAudioElement.dispatchMockEvent('error');
      });

      await waitFor(() => {
        expect(button).toHaveAttribute('title', 'Play');
        expect(button).not.toBeDisabled();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Audio error:', expect.any(Event));
      consoleSpy.mockRestore();
    });

    it('should handle play() rejection', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Set up play to reject AFTER render so we have the correct mockAudioElement
      mockAudioElement.play = vi.fn().mockRejectedValue(new Error('Play failed'));

      const button = screen.getByRole('button');
      await user.click(button);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Playback error:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('should do nothing when audioUrl is missing', async () => {
      const { rerender } = render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Force re-render with empty URL
      rerender(<TrackPlayButton audioUrl="" />);

      // Component should not render
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('URL change handling', () => {
    it('should pause and reset when audioUrl changes', () => {
      const { rerender } = render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Simulate playing
      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      // Change URL
      rerender(<TrackPlayButton audioUrl="https://cdn.example.com/audio/track2.mp3" />);

      expect(mockAudioElement.pause).toHaveBeenCalled();
    });

    it('should not pause when audioUrl stays the same', () => {
      const { rerender } = render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Clear pause calls
      mockAudioElement.pause.mockClear();

      // Re-render with same URL
      rerender(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Pause should not be called from URL change effect
      // (it might be called during cleanup, but not from URL change)
      expect(mockAudioElement.pause).not.toHaveBeenCalled();
    });

    it('should not update when audioUrl changes to empty string', () => {
      const { rerender } = render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Clear pause calls
      mockAudioElement.pause.mockClear();

      // Change to empty URL (component won't render but effect runs)
      rerender(<TrackPlayButton audioUrl="" />);

      // Should not pause when URL becomes empty
      expect(mockAudioElement.pause).not.toHaveBeenCalled();
    });
  });

  describe('multiple instance coordination', () => {
    it('should dispatch custom event when starting playback', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      const user = userEvent.setup();

      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'track-play-button:play',
        })
      );
    });

    it('should listen for other instances playing', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      expect(windowListeners['track-play-button:play']).toBeDefined();
      expect(windowListeners['track-play-button:play'].length).toBeGreaterThan(0);
    });

    it('should pause when another instance starts playing', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      // Store ref to this component's audio element
      const componentAudioElement = mockAudioElement;

      const button = screen.getByRole('button');
      await user.click(button);

      act(() => {
        componentAudioElement.dispatchMockEvent('play');
      });

      // Clear mock to check pause from other instance
      componentAudioElement.pause.mockClear();

      // Simulate another instance playing (different audio element)
      // Create a plain object to represent another audio element
      const otherAudioElement = { different: true };
      act(() => {
        window.dispatchEvent(
          new CustomEvent('track-play-button:play', {
            detail: { audioElement: otherAudioElement },
          })
        );
      });

      expect(componentAudioElement.pause).toHaveBeenCalled();
    });

    it('should not pause itself when it dispatches play event', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const button = screen.getByRole('button');
      await user.click(button);

      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      // Clear pause to check
      mockAudioElement.pause.mockClear();

      // Simulate this instance's own event (same audio element)
      act(() => {
        window.dispatchEvent(
          new CustomEvent('track-play-button:play', {
            detail: { audioElement: mockAudioElement },
          })
        );
      });

      // Should not pause itself
      expect(mockAudioElement.pause).not.toHaveBeenCalled();
    });

    it('should remove event listener on unmount', () => {
      const { unmount } = render(<TrackPlayButton audioUrl={validAudioUrl} />);

      const listenerCount = windowListeners['track-play-button:play']?.length || 0;

      unmount();

      expect(windowListeners['track-play-button:play']?.length || 0).toBeLessThan(listenerCount);
    });
  });

  describe('iconOnly prop', () => {
    it('should not render sr-only text when iconOnly is true (default)', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} />);

      expect(screen.queryByText('Play', { selector: '.sr-only' })).not.toBeInTheDocument();
    });

    it('should render sr-only text when iconOnly is false', () => {
      render(<TrackPlayButton audioUrl={validAudioUrl} iconOnly={false} />);

      expect(screen.getByText('Play', { selector: '.sr-only' })).toBeInTheDocument();
    });

    it('should show Pause sr-only text when playing and iconOnly is false', async () => {
      const user = userEvent.setup();
      render(<TrackPlayButton audioUrl={validAudioUrl} iconOnly={false} />);

      const button = screen.getByRole('button');
      await user.click(button);

      act(() => {
        mockAudioElement.dispatchMockEvent('play');
      });

      await waitFor(() => {
        expect(screen.getByText('Pause', { selector: '.sr-only' })).toBeInTheDocument();
      });
    });
  });
});
