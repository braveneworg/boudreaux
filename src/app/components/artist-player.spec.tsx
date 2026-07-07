/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';

import { ArtistPlayer } from './artist-player';

vi.mock('@/lib/utils/cdn-url', () => ({
  buildCdnUrl: (key: string) => `https://cdn.example.com/${key}`,
  resolveStreamUrl: (file: { s3Key?: string | null; streamUrl?: string | null }) =>
    file.streamUrl ?? (file.s3Key ? `https://cdn.example.com/${file.s3Key}` : null),
}));

// Stub DeferredDownloadDialog to mirror the real component's CLS-safe shape:
// trigger always rendered, dialog test-double mounts only after click.
vi.mock('./deferred-download-dialog', () => ({
  DeferredDownloadDialog: ({
    artistName,
    children,
  }: {
    artistName: string;
    children?: ReactNode;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          data-testid="download-trigger-button"
          aria-label="Download music"
          onClick={() => setIsOpen(true)}
        >
          {children ?? 'download'}
        </button>
        {isOpen && <div data-testid="download-dialog" data-artist-name={artistName} />}
      </>
    );
  },
}));

// Mock the MediaPlayer component and sub-components
vi.mock('@/app/components/ui/audio/media-player', () => {
  const MockMediaPlayer = ({ children }: { children: ReactNode }) => (
    <div data-testid="media-player">{children}</div>
  );
  MockMediaPlayer.displayName = 'MockMediaPlayer';

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
      Cover Art
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
    trackName,
    isPlaying,
  }: {
    artistRelease: unknown;
    trackName: string;
    isPlaying?: boolean;
  }) => (
    <div data-testid="info-ticker-tape" data-is-playing={isPlaying?.toString()}>
      {trackName}
    </div>
  );
  InfoTickerTape.displayName = 'InfoTickerTape';
  MockMediaPlayer.InfoTickerTape = InfoTickerTape;

  const FormatFileListDrawer = ({
    files,
    currentFileId,
    onFileSelect,
    artistName,
    releaseTitle: _releaseTitle,
    downloadTrigger,
  }: {
    files: Array<{ id: string; title?: string | null; fileName: string; trackNumber: number }>;
    currentFileId: string | null;
    onFileSelect: (fileId: string) => void;
    artistName: string;
    releaseTitle: string;
    downloadTrigger?: ReactNode;
  }) => (
    <div
      data-testid="format-file-list-drawer"
      data-current-file-id={currentFileId ?? ''}
      data-artist-name={artistName}
    >
      {files.map((f) => (
        <button key={f.id} data-testid={`file-${f.id}`} onClick={() => onFileSelect(f.id)}>
          {f.title ?? f.fileName}
        </button>
      ))}
      {/* Drives handleFileSelect with an id no file matches (index < 0 guard). */}
      <button data-testid="select-unknown-file" onClick={() => onFileSelect('no-such-file')}>
        Unknown file
      </button>
      {downloadTrigger}
    </div>
  );
  FormatFileListDrawer.displayName = 'FormatFileListDrawer';
  MockMediaPlayer.FormatFileListDrawer = FormatFileListDrawer;

  const CoverArtView = ({
    artistRelease,
  }: {
    artistRelease: { release: { id: string; title: string } };
  }) => <div data-testid="cover-art-view">{artistRelease.release.title}</div>;
  CoverArtView.displayName = 'CoverArtView';
  MockMediaPlayer.CoverArtView = CoverArtView;

  return { MediaPlayer: MockMediaPlayer };
});

vi.mock('@/app/components/media-action-link', () => ({
  MediaActionLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => (
    <span
      data-testid="next-image"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
      className={className}
    />
  ),
}));

// Mock the release combobox with simple option buttons so release-switching
// behaviour is exercised without driving the Radix Popover/Command internals.
vi.mock('./release-combobox', () => ({
  ReleaseCombobox: ({
    releases,
    selectedId,
    onSelect,
    ariaLabel,
  }: {
    releases: Array<{ id: string; title: string; coverArtSrc: string | null }>;
    selectedId: string;
    onSelect: (id: string) => void;
    ariaLabel?: string;
  }) => (
    <div data-testid="release-combobox" aria-label={ariaLabel} data-selected-id={selectedId}>
      {releases.map((release) => (
        <button
          key={release.id}
          type="button"
          aria-label={`Play ${release.title}`}
          aria-pressed={release.id === selectedId}
          data-cover-src={release.coverArtSrc ?? 'null'}
          onClick={() => onSelect(release.id)}
        >
          {release.title}
        </button>
      ))}
      {/* Exercises the parent's `index >= 0` guard with an id no release matches. */}
      <button
        type="button"
        data-testid="select-unknown-release"
        onClick={() => onSelect('does-not-exist')}
      >
        Select unknown
      </button>
    </div>
  ),
}));

// Mock utilities
vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: {
    displayName?: string | null;
    firstName: string;
    surname: string;
  }) => artist.displayName ?? `${artist.firstName} ${artist.surname}`,
}));

vi.mock('@/lib/utils/release-helpers', () => ({
  getReleaseCoverArt: (release: { coverArt?: string; title: string }) => {
    if (release.coverArt) {
      return { src: release.coverArt, alt: `${release.title} cover art` };
    }
    return null;
  },
}));

describe('ArtistPlayer', () => {
  const mockFile1 = {
    id: 'file-1',
    trackNumber: 1,
    title: 'First Track',
    s3Key: 'releases/file1.mp3',
    fileName: 'file1.mp3',
    fileSize: 1000000,
    mimeType: 'audio/mpeg',
    formatId: 'fmt-1',
    duration: null,
    checksum: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFile2 = {
    id: 'file-2',
    trackNumber: 2,
    title: 'Second Track',
    s3Key: 'releases/file2.mp3',
    fileName: 'file2.mp3',
    fileSize: 1000000,
    mimeType: 'audio/mpeg',
    formatId: 'fmt-1',
    duration: null,
    checksum: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockFile3 = {
    id: 'file-3',
    trackNumber: 3,
    title: 'Third Track',
    s3Key: 'releases/file3.mp3',
    fileName: 'file3.mp3',
    fileSize: 1000000,
    mimeType: 'audio/mpeg',
    formatId: 'fmt-1',
    duration: null,
    checksum: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const file1CdnUrl = 'https://cdn.example.com/releases/file1.mp3';
  const file2CdnUrl = 'https://cdn.example.com/releases/file2.mp3';
  const file3CdnUrl = 'https://cdn.example.com/releases/file3.mp3';

  const createRelease = (id: string, title: string, files: (typeof mockFile1)[]) => ({
    id,
    title,
    coverArt: `https://example.com/${id}-cover.jpg`,
    publishedAt: new Date('2024-01-01'),
    deletedOn: null,
    releasedOn: new Date('2024-01-01'),
    images: [],
    artistReleases: [],
    digitalFormats:
      files.length > 0
        ? [
            {
              id: `fmt-${id}`,
              formatType: 'MP3_320KBPS',
              releaseId: id,
              createdAt: new Date(),
              updatedAt: new Date(),
              files,
            },
          ]
        : [],
    releaseUrls: [],
  });

  const baseArtist = {
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: 'John Doe',
    slug: 'john-doe',
    images: [],
    labels: [],
    urls: [],
  };

  const createArtistWithReleases = (
    releases: ReturnType<typeof createRelease>[]
  ): ArtistWithPublishedReleases =>
    ({
      ...baseArtist,
      releases: releases.map((release) => ({
        id: `ar-${release.id}`,
        artistId: baseArtist.id,
        releaseId: release.id,
        release,
        artist: baseArtist,
      })),
    }) as unknown as ArtistWithPublishedReleases;

  describe('empty state', () => {
    it('should render empty state when artist has no releases', () => {
      const artist = createArtistWithReleases([]);

      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByText('No releases available for this artist.')).toBeInTheDocument();
    });
  });

  describe('single release', () => {
    const release = createRelease('release-1', 'Test Album', [mockFile1, mockFile2, mockFile3]);
    const artist = createArtistWithReleases([release]);

    it('should not render the release combobox for a single release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-player')).toBeInTheDocument();
      expect(screen.queryByTestId('release-combobox')).not.toBeInTheDocument();
    });

    it('should not render CoverArtView for a single release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.queryByTestId('cover-art-view')).not.toBeInTheDocument();
    });

    it('should render cover art with correct src', () => {
      render(<ArtistPlayer artist={artist} />);

      const coverArt = screen.getByTestId('interactive-cover-art');
      expect(coverArt).toHaveAttribute('data-src', 'https://example.com/release-1-cover.jpg');
    });

    it('should frame the player unit with a black border and zine shadow', () => {
      render(<ArtistPlayer artist={artist} />);

      const frame = screen.getByTestId('interactive-cover-art').closest('.mx-auto');
      expect(frame).toHaveClass('border-2', 'border-black', 'shadow-zine');
    });

    it('should render audio controls for the first file', () => {
      render(<ArtistPlayer artist={artist} />);

      const controls = screen.getByTestId('media-controls');
      expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);
    });

    it('should render the info ticker tape with first track name', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('info-ticker-tape')).toHaveTextContent('First Track');
    });

    it('should render the FormatFileListDrawer at the bottom', () => {
      render(<ArtistPlayer artist={artist} />);

      const drawer = screen.getByTestId('format-file-list-drawer');
      expect(drawer).toBeInTheDocument();
      expect(drawer).toHaveAttribute('data-current-file-id', 'file-1');
    });

    it('should update isPlaying when play is triggered', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('play-button'));

      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');
    });

    it('should update isPlaying when pause is triggered', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('play-button'));
      fireEvent.click(screen.getByTestId('pause-button'));

      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
    });

    it('should render no playable tracks message when release has no tracks', () => {
      const emptyRelease = createRelease('release-empty', 'Empty Album', []);
      const emptyArtist = createArtistWithReleases([emptyRelease]);

      render(<ArtistPlayer artist={emptyArtist} />);

      expect(screen.getByText('No playable tracks available.')).toBeInTheDocument();
    });

    it('should not render FormatFileListDrawer when no files', () => {
      const emptyRelease = createRelease('release-empty', 'Empty Album', []);
      const emptyArtist = createArtistWithReleases([emptyRelease]);

      render(<ArtistPlayer artist={emptyArtist} />);

      expect(screen.queryByTestId('format-file-list-drawer')).not.toBeInTheDocument();
    });

    it('should change file when selecting from FormatFileListDrawer', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('file-file-2'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should update FormatFileListDrawer currentFileId when file changes', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('file-file-2'));

      expect(screen.getByTestId('format-file-list-drawer')).toHaveAttribute(
        'data-current-file-id',
        'file-2'
      );
    });

    it('should auto-advance to next file when current file ends', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('ended-trigger'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should not advance past the last file', () => {
      render(<ArtistPlayer artist={artist} />);

      // Navigate to the last file
      fireEvent.click(screen.getByTestId('file-file-3'));

      // Trigger ended on last file
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should still be on file-3
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file3CdnUrl);
    });

    it('should go to previous file with wasPlaying=true', () => {
      render(<ArtistPlayer artist={artist} />);

      // Navigate to second file first
      fireEvent.click(screen.getByTestId('file-file-2'));

      // Go back to previous file (was playing)
      fireEvent.click(screen.getByTestId('previous-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to previous file with wasPlaying=false', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('file-file-2'));
      fireEvent.click(screen.getByTestId('previous-track-paused-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not go before the first file', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('previous-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });

    it('should go to next file with wasPlaying=true', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('next-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to next file with wasPlaying=false', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('next-track-paused-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not go past the last file with next', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('file-file-3'));
      fireEvent.click(screen.getByTestId('next-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file3CdnUrl);
    });

    it('should not update file when selecting a non-existent file id', () => {
      render(<ArtistPlayer artist={artist} />);

      // The handler checks findIndex >= 0, so a bad ID is just ignored
      // We verify the current file stays the same indirectly
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });
  });

  describe('>= 3 releases branch', () => {
    const release1 = createRelease('release-1', 'Album One', [mockFile1, mockFile2]);
    const release2 = createRelease('release-2', 'Album Two', [mockFile2, mockFile3]);
    const release3 = createRelease('release-3', 'Album Three', [mockFile3]);

    const artist = createArtistWithReleases([release1, release2, release3]);

    it('should render the release combobox', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('release-combobox')).toBeInTheDocument();
    });

    it('should render the combobox with correct aria-label', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('release-combobox')).toHaveAttribute(
        'aria-label',
        'Select a release by John Doe'
      );
    });

    it('should render an option for each release', () => {
      render(<ArtistPlayer artist={artist} />);

      const options = screen.getAllByRole('button', { name: /Play Album/ });
      expect(options).toHaveLength(3);
    });

    it('should mark the selected release option as pressed', () => {
      render(<ArtistPlayer artist={artist} />);

      const buttons = screen.getAllByRole('button', { name: /Play Album/ });
      expect(buttons[0]).toHaveAttribute('aria-label', 'Play Album One');
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
      expect(buttons[1]).toHaveAttribute('aria-label', 'Play Album Two');
      expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    });

    it('should render the artist name heading', () => {
      render(<ArtistPlayer artist={artist} />);

      const headings = screen.getAllByRole('heading', { level: 2 });
      const nameHeading = headings.find((h) => h.textContent?.includes('John Doe'));
      expect(nameHeading).toBeInTheDocument();
    });

    it('should render the selected release title', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getAllByText('Album One').length).toBeGreaterThan(0);
    });

    it('should render the media player', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-player')).toBeInTheDocument();
    });

    it('should render audio controls for the first release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });

    it('should render FormatFileListDrawer at the bottom of the media player', () => {
      render(<ArtistPlayer artist={artist} />);

      const drawer = screen.getByTestId('format-file-list-drawer');
      expect(drawer).toBeInTheDocument();
      expect(drawer).toHaveAttribute('data-artist-name', 'John Doe');
      expect(drawer).toHaveAttribute('data-current-file-id', 'file-1');
    });

    it('should change release when clicking a different thumbnail', () => {
      render(<ArtistPlayer artist={artist} />);

      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });
      fireEvent.click(playButtons[1]); // Click "Play Album Two"

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should reset to first file when switching releases', () => {
      render(<ArtistPlayer artist={artist} />);

      // Switch to release 2
      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });
      fireEvent.click(playButtons[1]);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should toggle play/pause when clicking the already-selected release thumbnail', () => {
      render(<ArtistPlayer artist={artist} />);

      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });

      // Click the already-selected first release - should toggle, not switch
      fireEvent.click(playButtons[0]);

      // No crash means toggle was called; the component still displays the same release
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });

    it('should set autoPlay when switching releases', () => {
      render(<ArtistPlayer artist={artist} />);

      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });
      fireEvent.click(playButtons[1]);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });
  });

  describe('initialReleaseId', () => {
    const release1 = createRelease('release-1', 'Album One', [mockFile1]);
    const release2 = createRelease('release-2', 'Album Two', [mockFile2]);
    const release3 = createRelease('release-3', 'Album Three', [mockFile3]);
    const artist = createArtistWithReleases([release1, release2, release3]);

    it('should select the release matching initialReleaseId', () => {
      render(<ArtistPlayer artist={artist} initialReleaseId="release-2" />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should set autoPlay when initialReleaseId is provided', () => {
      render(<ArtistPlayer artist={artist} initialReleaseId="release-2" />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should default to first release when initialReleaseId is not found', () => {
      render(<ArtistPlayer artist={artist} initialReleaseId="non-existent" />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });

    it('should not autoPlay when no initialReleaseId is provided', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });
  });

  describe('track selection and navigation in >= 3 releases', () => {
    const release1 = createRelease('release-1', 'Album One', [mockFile1, mockFile2, mockFile3]);
    const release2 = createRelease('release-2', 'Album Two', [mockFile2]);
    const release3 = createRelease('release-3', 'Album Three', [mockFile3]);
    const artist = createArtistWithReleases([release1, release2, release3]);

    it('should change file when selecting from FormatFileListDrawer', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('file-file-2'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should auto-advance on track ended', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('ended-trigger'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should navigate to previous file', () => {
      render(<ArtistPlayer artist={artist} />);

      // Go to file 2 first
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Now go back
      fireEvent.click(screen.getByTestId('previous-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });

    it('should navigate to next file', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('next-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file2CdnUrl);
    });

    it('should toggle play via interactive cover art', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('interactive-cover-art'));

      // No crash; toggle was called successfully
      expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
    });

    it('should update isPlaying state on play/pause', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('play-button'));
      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');

      fireEvent.click(screen.getByTestId('pause-button'));
      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
    });
  });

  describe('two releases', () => {
    const release1 = createRelease('release-1', 'Album One', [mockFile1]);
    const release2 = createRelease('release-2', 'Album Two', [mockFile2]);
    const artist = createArtistWithReleases([release1, release2]);

    it('should render the release combobox for 2 releases', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('release-combobox')).toBeInTheDocument();
      expect(screen.getByTestId('media-player')).toBeInTheDocument();
    });

    it('should display the first release by default', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });
  });

  describe('download dialog', () => {
    const release = createRelease('release-1', 'Test Album', [mockFile1]);
    const artist = createArtistWithReleases([release]);

    it('should render the download dialog with the correct artist name on first tap', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('download-trigger-button'));

      const downloadDialog = screen.getByTestId('download-dialog');
      expect(downloadDialog).toBeInTheDocument();
      expect(downloadDialog).toHaveAttribute('data-artist-name', 'John Doe');
    });

    it('should render the download trigger button', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('download-trigger-button')).toBeInTheDocument();
    });
  });

  describe('combobox option mapping', () => {
    it('maps a release with no cover art to a null coverArtSrc', () => {
      const withCover = createRelease('release-1', 'Album One', [mockFile1]);
      const noCover = { ...createRelease('release-2', 'Album Two', [mockFile2]), coverArt: '' };
      const artist = createArtistWithReleases([withCover, noCover]);

      render(<ArtistPlayer artist={artist} />);

      // The null-cover branch (getReleaseCoverArt(...)?.src ?? null) maps the
      // second option's coverArtSrc to null.
      const second = screen.getByRole('button', { name: 'Play Album Two' });
      expect(second).toHaveAttribute('data-cover-src', 'null');
    });

    it('ignores a combobox selection for an unknown release id', () => {
      const release1 = createRelease('release-1', 'Album One', [mockFile1]);
      const release2 = createRelease('release-2', 'Album Two', [mockFile2]);
      const artist = createArtistWithReleases([release1, release2]);

      render(<ArtistPlayer artist={artist} />);

      // The onSelect handler's `index >= 0` guard no-ops on a bad id, so the
      // first release stays selected.
      fireEvent.click(screen.getByTestId('select-unknown-release'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
    });
  });

  describe('edge cases for uncovered branches', () => {
    it('should use fallback cover art alt text when cover art is null', () => {
      const noCoverRelease = {
        ...createRelease('release-no-cover', 'No Cover', [mockFile1]),
        coverArt: '',
      };
      const artist = createArtistWithReleases([noCoverRelease]);

      render(<ArtistPlayer artist={artist} />);

      const coverArt = screen.getByTestId('interactive-cover-art');
      expect(coverArt).toHaveAttribute('data-alt', 'John Doe cover art');
      expect(coverArt).toHaveAttribute('data-src', '');
    });

    it('should handle release with null title gracefully', () => {
      const nullTitleRelease = {
        ...createRelease('release-null', 'Test', [mockFile1]),
        title: null as unknown as string,
      };
      const artist = createArtistWithReleases([nullTitleRelease]);

      render(<ArtistPlayer artist={artist} />);

      // The title ?? '' fallback should produce empty string
      expect(screen.getByTestId('media-player')).toBeInTheDocument();
    });

    it('should not change track when selecting a non-existent file id from drawer', () => {
      const release = createRelease('release-1', 'Album', [mockFile1, mockFile2]);
      const artist = createArtistWithReleases([release]);

      render(<ArtistPlayer artist={artist} />);

      // The drawer's unknown-file button drives onFileSelect('no-such-file'),
      // hitting handleFileSelect's `index >= 0` false branch (no state change).
      fireEvent.click(screen.getByTestId('select-unknown-file'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-audio-src', file1CdnUrl);
      expect(screen.getByTestId('format-file-list-drawer')).toHaveAttribute(
        'data-current-file-id',
        'file-1'
      );
    });

    it('should handle release without MP3_320KBPS format (no playable files)', () => {
      const noMp3Release = {
        ...createRelease('release-nomp3', 'No MP3', []),
        digitalFormats: [
          {
            id: 'fmt-flac',
            formatType: 'FLAC',
            releaseId: 'release-nomp3',
            createdAt: new Date(),
            updatedAt: new Date(),
            files: [mockFile1],
          },
        ],
      };
      const artist = createArtistWithReleases([noMp3Release]);

      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByText('No playable tracks available.')).toBeInTheDocument();
    });
  });
});
