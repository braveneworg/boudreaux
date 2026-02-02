import { render, screen, waitFor } from '@testing-library/react';

import { AudioPlayer } from './audio-player';

// Mock video.js
const mockPlayer = {
  src: vi.fn(),
  ready: vi.fn((callback) => callback()),
  on: vi.fn(),
  isDisposed: vi.fn(() => false),
  dispose: vi.fn(),
};

vi.mock('video.js', () => ({
  __esModule: true,
  default: vi.fn(() => mockPlayer),
}));

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayer.isDisposed.mockReturnValue(false);
  });

  it('renders the player container', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(document.querySelector('[data-vjs-player]')).toBeInTheDocument();
  });

  it('renders with default audio type', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(mockPlayer.src).toHaveBeenCalledWith({
      src: '/audio/track.mp3',
      type: 'audio/mp3',
    });
  });

  it('renders with custom audio type', () => {
    render(<AudioPlayer src="/audio/track.ogg" type="audio/ogg" />);

    expect(mockPlayer.src).toHaveBeenCalledWith({
      src: '/audio/track.ogg',
      type: 'audio/ogg',
    });
  });

  it('renders poster image when provided', () => {
    render(<AudioPlayer src="/audio/track.mp3" poster="/images/album.jpg" />);

    const posterImage = screen.getByAltText('Album cover');
    expect(posterImage).toBeInTheDocument();
    expect(posterImage).toHaveAttribute('src', '/images/album.jpg');
  });

  it('does not render poster image when not provided', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(screen.queryByAltText('Album cover')).not.toBeInTheDocument();
  });

  it('calls onReady callback when player is ready', () => {
    const mockOnReady = vi.fn();

    render(<AudioPlayer src="/audio/track.mp3" onReady={mockOnReady} />);

    expect(mockPlayer.ready).toHaveBeenCalled();
    expect(mockOnReady).toHaveBeenCalledWith(mockPlayer);
  });

  it('does not call onReady when not provided', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(mockPlayer.ready).toHaveBeenCalled();
    // Just verify no error is thrown
  });

  it('has responsive player container classes', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    const container = document.querySelector('[data-vjs-player]');
    expect(container).toHaveClass('w-[90%]');
    expect(container).toHaveClass('responsive');
  });

  it('renders poster container with correct classes', () => {
    render(<AudioPlayer src="/audio/track.mp3" poster="/images/album.jpg" />);

    const posterContainer = screen.getByAltText('Album cover').parentElement;
    expect(posterContainer).toHaveClass('overflow-hidden');
    expect(posterContainer).toHaveClass('shadow-lg');
  });

  it('disposes player on unmount', async () => {
    const { unmount } = render(<AudioPlayer src="/audio/track.mp3" />);

    unmount();

    await waitFor(() => {
      expect(mockPlayer.dispose).toHaveBeenCalled();
    });
  });

  it('does not dispose already disposed player', async () => {
    mockPlayer.isDisposed.mockReturnValue(true);

    const { unmount } = render(<AudioPlayer src="/audio/track.mp3" />);

    unmount();

    await waitFor(() => {
      expect(mockPlayer.dispose).not.toHaveBeenCalled();
    });
  });
});
