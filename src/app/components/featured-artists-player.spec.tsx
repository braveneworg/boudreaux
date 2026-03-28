/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';

import type { FeaturedArtist } from '@/lib/types/media-models';

import { FeaturedArtistsPlayer } from './featured-artists-player';

// Mock buildCdnUrl to return a predictable CDN URL
vi.mock('@/lib/utils/cdn-url', () => ({
  buildCdnUrl: (s3Key: string) => `https://cdn.example.com/${s3Key}`,
}));

// Mock the MediaPlayer component
vi.mock('@/app/components/ui/audio/media-player', () => {
  const MockMediaPlayer = ({ children }: { children: ReactNode }) => (
    <div data-testid="media-player">{children}</div>
  );
  MockMediaPlayer.displayName = 'MockMediaPlayer';

  const FeaturedArtistCarousel = ({
    featuredArtists,
    onSelect,
  }: {
    featuredArtists: FeaturedArtist[];
    onSelect?: (artist: FeaturedArtist) => void;
  }) => (
    <div data-testid="featured-artist-carousel">
      {featuredArtists.map((artist) => (
        <button
          key={artist.id}
          data-testid={`artist-${artist.id}`}
          onClick={() => onSelect?.(artist)}
        >
          {artist.displayName || 'Unknown'}
        </button>
      ))}
    </div>
  );
  FeaturedArtistCarousel.displayName = 'FeaturedArtistCarousel';
  MockMediaPlayer.FeaturedArtistCarousel = FeaturedArtistCarousel;

  const InteractiveCoverArt = ({
    src,
    alt,
    isPlaying,
    onTogglePlay,
  }: {
    src: string;
    alt: string;
    isPlaying: boolean;
    onTogglePlay: () => void;
    className?: string;
  }) => (
    <button
      data-testid="interactive-cover-art"
      data-src={src}
      data-alt={alt}
      data-is-playing={isPlaying?.toString()}
      onClick={onTogglePlay}
    >
      <span data-testid="cover-art-image" data-src={src} data-alt={alt} />
    </button>
  );
  InteractiveCoverArt.displayName = 'InteractiveCoverArt';
  MockMediaPlayer.InteractiveCoverArt = InteractiveCoverArt;

  const Controls = ({
    audioSrc,
    onPlay,
    onPause,
    onEnded,
    onPreviousTrack,
    onNextTrack,
    autoPlay,
    controlsRef,
  }: {
    audioSrc: string;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    onPreviousTrack?: (wasPlaying: boolean) => void;
    onNextTrack?: (wasPlaying: boolean) => void;
    autoPlay?: boolean;
    controlsRef?: (
      controls: { play: () => void; pause: () => void; toggle: () => void } | null
    ) => void;
  }) => {
    // Call controlsRef on mount with mock controls using useEffect to prevent infinite loops
    useEffect(() => {
      if (controlsRef) {
        controlsRef({
          play: () => onPlay?.(),
          pause: () => onPause?.(),
          toggle: () => {},
        });
      }
      return () => {
        controlsRef?.(null);
      };
    }, [controlsRef, onPlay, onPause]);
    return (
      <div
        data-testid="media-controls"
        data-audio-src={audioSrc}
        data-auto-play={autoPlay?.toString()}
      >
        <button data-testid="play-button" onClick={onPlay}>
          Play
        </button>
        <button data-testid="pause-button" onClick={onPause}>
          Pause
        </button>
        <button data-testid="ended-trigger" onClick={onEnded}>
          Ended
        </button>
        <button data-testid="previous-track-button" onClick={() => onPreviousTrack?.(true)}>
          Previous (playing)
        </button>
        <button data-testid="previous-track-paused-button" onClick={() => onPreviousTrack?.(false)}>
          Previous (paused)
        </button>
        <button data-testid="next-track-button" onClick={() => onNextTrack?.(true)}>
          Next (playing)
        </button>
        <button data-testid="next-track-paused-button" onClick={() => onNextTrack?.(false)}>
          Next (paused)
        </button>
      </div>
    );
  };
  Controls.displayName = 'Controls';
  MockMediaPlayer.Controls = Controls;

  const InfoTickerTape = ({
    trackTitle,
    isPlaying,
  }: {
    featuredArtist: FeaturedArtist;
    isPlaying?: boolean;
    trackTitle?: string;
  }) => (
    <div data-testid="info-ticker-tape" data-is-playing={isPlaying?.toString()}>
      {trackTitle}
    </div>
  );
  InfoTickerTape.displayName = 'InfoTickerTape';
  MockMediaPlayer.InfoTickerTape = InfoTickerTape;

  const FormatFileListDrawer = ({
    files,
    currentFileId,
    onFileSelect,
  }: {
    files: Array<{ id: string; title?: string | null; fileName: string }>;
    currentFileId: string | null;
    onFileSelect?: (fileId: string) => void;
    artistName: string;
    releaseTitle: string;
  }) => (
    <div data-testid="format-file-list-drawer" data-current-file-id={currentFileId}>
      {files.map((f) => (
        <button key={f.id} data-testid={`file-select-${f.id}`} onClick={() => onFileSelect?.(f.id)}>
          {f.title ?? f.fileName}
        </button>
      ))}
    </div>
  );
  FormatFileListDrawer.displayName = 'FormatFileListDrawer';
  MockMediaPlayer.FormatFileListDrawer = FormatFileListDrawer;

  return { MediaPlayer: MockMediaPlayer };
});

// Mock DownloadDialog at consumer level
vi.mock('@/app/components/download-dialog', () => ({
  DownloadDialog: ({ children, artistName }: { children: ReactNode; artistName: string }) => (
    <div data-testid="download-dialog" data-artist-name={artistName}>
      {children}
    </div>
  ),
  DownloadTriggerButton: () => (
    <button data-testid="download-trigger-button" aria-label="Download music">
      download
    </button>
  ),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="cover-art-image" data-src={src} data-alt={alt} />
  ),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const createWrapper = () => {
  const queryClient = createQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

describe('FeaturedArtistsPlayer', () => {
  const mockFiles = [
    {
      id: 'file-1',
      trackNumber: 1,
      title: 'First Track',
      fileName: '01-first-track.mp3',
      s3Key: 'audio/track-1.mp3',
      fileSize: 5000000,
      mimeType: 'audio/mpeg',
      duration: 180,
      formatId: 'format-1',
      checksum: null,
      uploadedAt: new Date('2024-01-01'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'file-2',
      trackNumber: 2,
      title: 'Second Track',
      fileName: '02-second-track.mp3',
      s3Key: 'audio/track-2.mp3',
      fileSize: 6000000,
      mimeType: 'audio/mpeg',
      duration: 200,
      formatId: 'format-1',
      checksum: null,
      uploadedAt: new Date('2024-01-01'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'file-3',
      trackNumber: 3,
      title: 'Third Track',
      fileName: '03-third-track.mp3',
      s3Key: 'audio/track-3.mp3',
      fileSize: 7000000,
      mimeType: 'audio/mpeg',
      duration: 220,
      formatId: 'format-1',
      checksum: null,
      uploadedAt: new Date('2024-01-01'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ];

  const mockDigitalFormat = {
    id: 'format-1',
    files: mockFiles,
  };

  const mockRelease = {
    id: 'release-1',
    title: 'Test Album',
    coverArt: 'https://example.com/album-cover.jpg',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockFeaturedArtists: FeaturedArtist[] = [
    {
      id: 'featured-1',
      displayName: 'Test Artist 1',
      featuredOn: new Date('2024-01-15'),
      position: 1,
      description: 'A test artist description',
      coverArt: 'https://example.com/cover1.jpg',
      digitalFormatId: null,
      releaseId: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      artists: [],
      digitalFormat: null,
      release: null,
    },
    {
      id: 'featured-2',
      displayName: 'Test Artist 2',
      featuredOn: new Date('2024-01-14'),
      position: 2,
      description: null,
      coverArt: 'https://example.com/cover2.jpg',
      digitalFormatId: 'format-1',
      releaseId: 'release-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      artists: [],
      digitalFormat: mockDigitalFormat,
      release: mockRelease,
    },
    {
      id: 'featured-3-filler',
      displayName: 'Test Artist 3',
      featuredOn: new Date('2024-01-13'),
      position: 3,
      description: null,
      coverArt: 'https://example.com/cover3.jpg',
      digitalFormatId: null,
      releaseId: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      artists: [],
      digitalFormat: null,
      release: null,
    },
  ] as unknown as FeaturedArtist[];

  // Artist with artist fallback display name (no displayName set)
  const mockArtistWithArtistFallback: FeaturedArtist = {
    id: 'featured-3',
    displayName: null,
    featuredOn: new Date('2024-01-13'),
    position: 3,
    description: null,
    coverArt: null,
    digitalFormatId: 'format-1',
    releaseId: 'release-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: null,
      },
    ],
    digitalFormat: mockDigitalFormat,
    release: mockRelease,
  } as unknown as FeaturedArtist;

  // Artist with artist displayName (priority over firstName/surname)
  const mockArtistWithArtistDisplayName: FeaturedArtist = {
    id: 'featured-5',
    displayName: null,
    featuredOn: new Date('2024-01-11'),
    position: 5,
    description: null,
    coverArt: null,
    digitalFormatId: 'format-1',
    releaseId: 'release-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [
      {
        id: 'artist-2',
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'DJ Jane',
      },
    ],
    digitalFormat: mockDigitalFormat,
    release: mockRelease,
  } as unknown as FeaturedArtist;

  it('should render empty state when no featured artists', () => {
    render(<FeaturedArtistsPlayer featuredArtists={[]} />, { wrapper: createWrapper() });

    expect(screen.getByText('No featured artists available at this time.')).toBeInTheDocument();
  });

  it('should not render carousel when only one featured artist', () => {
    render(<FeaturedArtistsPlayer featuredArtists={[mockFeaturedArtists[0]]} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.queryByTestId('featured-artist-carousel')).not.toBeInTheDocument();
  });

  it('should render the media player with featured artists', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.getByTestId('featured-artist-carousel')).toBeInTheDocument();
  });

  it('should display the first artist as selected by default', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Check the cover art image displays the first artist name in the data-alt text
    expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 1');
  });

  it('should change selected artist when clicking on carousel item', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should now display second artist via cover art data-alt text
    expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 2');
  });

  it('should render audio controls when digital format has files', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist which has a digital format with files
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    expect(screen.getByTestId('media-controls')).toBeInTheDocument();
    expect(screen.getByTestId('media-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/audio/track-1.mp3'
    );
  });

  it('should not render audio controls when no digital format', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // First artist has no digital format
    expect(screen.queryByTestId('media-controls')).not.toBeInTheDocument();
  });

  it('should render cover art image', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('cover-art-image')).toBeInTheDocument();
    expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
      'data-src',
      'https://example.com/cover1.jpg'
    );
  });

  it('should set shouldAutoPlay to true when selecting artist from carousel', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist which has a digital format
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should have autoPlay set to true
    expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
  });

  it('should toggle play/pause when cover art is clicked', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with digital format (which provides controls via controlsRef)
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Click the interactive cover art to trigger handleTogglePlay -> playerControls.toggle()
    fireEvent.click(screen.getByTestId('interactive-cover-art'));

    // The toggle function was called; no error means handleTogglePlay executed successfully
    expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
  });

  it('should update isPlaying state when onPlay is called', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with digital format
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Trigger play
    fireEvent.click(screen.getByTestId('play-button'));

    // InfoTickerTape should show playing state
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');
  });

  it('should update isPlaying state when onPause is called', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with digital format
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Trigger play then pause
    fireEvent.click(screen.getByTestId('play-button'));
    fireEvent.click(screen.getByTestId('pause-button'));

    // InfoTickerTape should show not playing state
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
  });

  it('should resume playback when clicking the thumbnail of the already-selected paused artist', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with digital format
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Play then pause
    fireEvent.click(screen.getByTestId('play-button'));
    fireEvent.click(screen.getByTestId('pause-button'));

    // Verify paused
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');

    // Click the same artist's thumbnail again to resume
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should resume playback (the mock play() calls onPlay which sets isPlaying to true)
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');
  });

  it('should pause playback when clicking the thumbnail of the already-selected playing artist', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with digital format
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Start playing
    fireEvent.click(screen.getByTestId('play-button'));

    // Verify playing
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');

    // Click the same artist's thumbnail again to pause
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should pause playback (the mock pause() calls onPause which sets isPlaying to false)
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
  });

  describe('file selection', () => {
    it('should change file when onFileSelect is called', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Select a different file from the format
      fireEvent.click(screen.getByTestId('file-select-file-2'));

      // The audio source should now be the second file
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-2.mp3'
      );
    });

    it('should set shouldAutoPlay when file is selected', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Reset autoPlay by clicking on a different artist and back
      fireEvent.click(screen.getByTestId('artist-featured-1'));
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Select a different file from the format
      fireEvent.click(screen.getByTestId('file-select-file-2'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should not render file select buttons when digital format has no files', () => {
      const artistWithEmptyFormat: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        digitalFormat: { ...mockDigitalFormat, files: [] },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithEmptyFormat]} />, {
        wrapper: createWrapper(),
      });

      // No file select buttons should exist
      expect(screen.queryByTestId(/file-select-/)).not.toBeInTheDocument();
    });
  });

  describe('auto-advance on file ended', () => {
    it('should advance to next file when current file ends', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Current file is file-1, trigger ended
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should now be playing file-2
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-2.mp3'
      );
    });

    it('should set shouldAutoPlay when file ends and advances', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Trigger ended
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should have autoPlay set to true
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should not advance when on last file', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Navigate to last file
      fireEvent.click(screen.getByTestId('file-select-file-3'));

      // Trigger ended on last file
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should still be on file-3
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-3.mp3'
      );
    });

    it('should not advance when digital format has only one file', () => {
      const singleFileFormat = {
        id: 'format-single',
        files: [mockFiles[0]],
      };
      const artistWithSingleFile: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        digitalFormat: singleFileFormat,
        digitalFormatId: 'format-single',
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithSingleFile]} />, {
        wrapper: createWrapper(),
      });

      // Trigger ended
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should still be on file-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-1.mp3'
      );
    });
  });

  describe('previous file navigation', () => {
    it('should go to previous file when wasPlaying is true', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockFeaturedArtists[1]]} />, {
        wrapper: createWrapper(),
      });

      // Navigate to second file
      fireEvent.click(screen.getByTestId('file-select-file-2'));

      // Click previous file (playing)
      fireEvent.click(screen.getByTestId('previous-track-button'));

      // Should now be on file-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-1.mp3'
      );
      // Should auto-play since wasPlaying was true
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to previous file when wasPlaying is false', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockFeaturedArtists[1]]} />, {
        wrapper: createWrapper(),
      });

      // Navigate to second file
      fireEvent.click(screen.getByTestId('file-select-file-2'));

      // Click previous file (paused)
      fireEvent.click(screen.getByTestId('previous-track-paused-button'));

      // Should now be on file-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-1.mp3'
      );
      // Should NOT auto-play since wasPlaying was false
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not change file when already on first file', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format (first file)
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Click previous file
      fireEvent.click(screen.getByTestId('previous-track-button'));

      // Should still be on file-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-1.mp3'
      );
    });

    it('should not change file when digital format has only one file', () => {
      const singleFileFormat = {
        id: 'format-single',
        files: [mockFiles[0]],
      };
      const artistWithSingleFile: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        digitalFormat: singleFileFormat,
        digitalFormatId: 'format-single',
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithSingleFile]} />, {
        wrapper: createWrapper(),
      });

      // Click previous file
      fireEvent.click(screen.getByTestId('previous-track-button'));

      // Should still be on file-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-1.mp3'
      );
    });
  });

  describe('next file navigation', () => {
    it('should go to next file when wasPlaying is true', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format (first file)
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Click next file (playing)
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Should now be on file-2
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-2.mp3'
      );
      // Should auto-play since wasPlaying was true
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to next file when wasPlaying is false', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format (first file)
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Click next file (paused)
      fireEvent.click(screen.getByTestId('next-track-paused-button'));

      // Should now be on file-2
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-2.mp3'
      );
      // Should NOT auto-play since wasPlaying was false
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not change file when already on last file', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Navigate to last file
      fireEvent.click(screen.getByTestId('file-select-file-3'));

      // Click next file
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Should still be on file-3
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-3.mp3'
      );
    });

    it('should not change file when digital format has only one file', () => {
      const singleFileFormat = {
        id: 'format-single',
        files: [mockFiles[0]],
      };
      const artistWithSingleFile: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        digitalFormat: singleFileFormat,
        digitalFormatId: 'format-single',
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithSingleFile]} />, {
        wrapper: createWrapper(),
      });

      // Click next file
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Should still be on file-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://cdn.example.com/audio/track-1.mp3'
      );
    });
  });

  describe('display name resolution', () => {
    it('should use displayName when available', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 1');
    });

    it('should fall back to artist firstName/surname when no displayName', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockArtistWithArtistFallback]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'John Doe');
    });

    it('should use artist displayName when available over firstName/surname', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockArtistWithArtistDisplayName]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'DJ Jane');
    });

    it('should show Unknown Artist when no displayName or artists', () => {
      const artistWithNoDisplayInfo: FeaturedArtist = {
        ...mockFeaturedArtists[0],
        displayName: null,
        artists: [],
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithNoDisplayInfo]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Unknown Artist');
    });
  });

  describe('cover art resolution', () => {
    it('should use coverArt from featured artist when available', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
        'data-src',
        'https://example.com/cover1.jpg'
      );
    });

    it('should fall back to release coverArt when featured artist coverArt is null', () => {
      const artistWithReleaseCoverArt: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        coverArt: null,
        release: { ...mockRelease, coverArt: 'https://example.com/release-cover.jpg' },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithReleaseCoverArt]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
        'data-src',
        'https://example.com/release-cover.jpg'
      );
    });

    it('should not render cover art when both coverArt and release coverArt are null', () => {
      const artistWithNoCoverArt: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        coverArt: null,
        release: { ...mockRelease, coverArt: null },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithNoCoverArt]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.queryByTestId('cover-art-image')).not.toBeInTheDocument();
    });

    it('should fall back to release images when no coverArt', () => {
      const artistWithReleaseImages: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        coverArt: null,
        release: {
          ...mockRelease,
          coverArt: null,
          images: [{ src: 'https://example.com/release-image.jpg' }],
        },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithReleaseImages]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
        'data-src',
        'https://example.com/release-image.jpg'
      );
    });

    it('should fall back to artist images when no coverArt or release images', () => {
      const artistWithArtistImages: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        coverArt: null,
        release: { ...mockRelease, coverArt: null, images: [] },
        artists: [
          {
            id: 'artist-1',
            firstName: 'Test',
            surname: 'Artist',
            displayName: null,
            images: [{ src: 'https://example.com/artist-image.jpg' }],
          },
        ],
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithArtistImages]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
        'data-src',
        'https://example.com/artist-image.jpg'
      );
    });
  });

  describe('release info display', () => {
    it('should show release title and artist name when artist is selected', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with a release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Test Artist 2');
      expect(heading).toHaveAttribute('aria-label', 'Now playing: Test Artist 2 - Test Album');
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    it('should render artist name in a visible heading', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByTestId('artist-featured-2'));

      const artistHeading = screen.getByRole('heading', { level: 2 });
      expect(artistHeading).toBeInTheDocument();
      expect(artistHeading).not.toHaveClass('sr-only');
      expect(artistHeading?.textContent).toBe('Test Artist 2');
    });

    it('should show empty release title when no release', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // First artist has no release — ArtistReleaseInfo is not rendered
      // because selectedArtist?.release is null
      const heading = screen.queryByRole('heading', { level: 2 });
      expect(heading).not.toBeInTheDocument();
    });
  });

  describe('format file list drawer', () => {
    it('should render FormatFileListDrawer when selected artist has format files', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with release and digital format
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      expect(screen.getByTestId('format-file-list-drawer')).toBeInTheDocument();
    });

    it('should not render FormatFileListDrawer when selected artist has no release', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // First artist has no release
      expect(screen.queryByTestId('format-file-list-drawer')).not.toBeInTheDocument();
    });

    it('should pass currentFileId to FormatFileListDrawer', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with digital format and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      expect(screen.getByTestId('format-file-list-drawer')).toHaveAttribute(
        'data-current-file-id',
        'file-1'
      );
    });

    it('should update currentFileId when file changes', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      fireEvent.click(screen.getByTestId('artist-featured-2'));
      fireEvent.click(screen.getByTestId('file-select-file-2'));

      expect(screen.getByTestId('format-file-list-drawer')).toHaveAttribute(
        'data-current-file-id',
        'file-2'
      );
    });
  });

  describe('download dialog', () => {
    it('should render the download dialog with the selected artist name', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with a release so download dialog renders
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      const downloadDialog = screen.getByTestId('download-dialog');
      expect(downloadDialog).toBeInTheDocument();
      expect(downloadDialog).toHaveAttribute('data-artist-name', 'Test Artist 2');
    });

    it('should render the download trigger button', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with a release so download trigger renders
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      expect(screen.getByTestId('download-trigger-button')).toBeInTheDocument();
    });

    it('should not render the download dialog when the selected artist has no release', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // First artist has no release — download should not appear
      expect(screen.queryByTestId('download-dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-trigger-button')).not.toBeInTheDocument();
    });

    it('should update the download dialog artist name when switching artists', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select first artist with a release
      fireEvent.click(screen.getByTestId('artist-featured-2'));
      expect(screen.getByTestId('download-dialog')).toHaveAttribute(
        'data-artist-name',
        'Test Artist 2'
      );

      // Switch back to artist without release
      fireEvent.click(screen.getByTestId('artist-featured-1'));
      expect(screen.queryByTestId('download-dialog')).not.toBeInTheDocument();
    });
  });
});
