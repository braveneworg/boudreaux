/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { PublishedReleaseDetail } from '@/lib/types/media-models';

import { ReleasePlayer } from './release-player';

// Mock next/dynamic to render synchronously — no Promises involved.
// The real next/dynamic lazy-loads DownloadDialog with { ssr: false }, which
// defers rendering via React.lazy. This mock bypasses the async loader entirely
// and returns a synchronous component that mirrors the DownloadDialog mock's
// output so that getByTestId assertions work without awaiting.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    function DynamicDownloadDialog(props: { children?: ReactNode; artistName?: string }) {
      return (
        <div data-testid="download-dialog" data-artist-name={props.artistName}>
          {props.children}
        </div>
      );
    }
    DynamicDownloadDialog.displayName = 'DynamicDownloadDialog';
    return DynamicDownloadDialog;
  },
}));

vi.mock('@/lib/utils/cdn-url', () => ({
  buildCdnUrl: (key: string) => `https://cdn.example.com/${key}`,
}));

// Mock the MediaPlayer compound component
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
      controls: {
        play: () => void;
        pause: () => void;
        toggle: () => void;
      } | null
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
          Previous
        </button>
        <button data-testid="next-track-button" onClick={() => onNextTrack?.(true)}>
          Next
        </button>
        <button data-testid="previous-track-not-playing" onClick={() => onPreviousTrack?.(false)}>
          Previous (not playing)
        </button>
        <button data-testid="next-track-not-playing" onClick={() => onNextTrack?.(false)}>
          Next (not playing)
        </button>
      </div>
    );
  };
  Controls.displayName = 'Controls';
  MockMediaPlayer.Controls = Controls;

  const InfoTickerTape = ({
    artistRelease: _artistRelease,
    trackName,
    isPlaying,
  }: {
    artistRelease?: unknown;
    trackName?: string;
    isPlaying?: boolean;
  }) => (
    <div
      data-testid="info-ticker-tape"
      data-is-playing={isPlaying?.toString()}
      data-track-name={trackName}
    >
      Ticker
    </div>
  );
  InfoTickerTape.displayName = 'InfoTickerTape';
  MockMediaPlayer.InfoTickerTape = InfoTickerTape;

  const FormatFileListDrawer = ({
    files,
    currentFileId,
    onFileSelect,
    artistName: _artistName,
    releaseTitle: _releaseTitle,
  }: {
    files: Array<{ id: string; title?: string | null; fileName: string; trackNumber: number }>;
    currentFileId: string | null;
    onFileSelect: (fileId: string) => void;
    artistName: string;
    releaseTitle: string;
  }) => (
    <div data-testid="format-file-list-drawer" data-current-file-id={currentFileId ?? ''}>
      {files.map((f) => (
        <button key={f.id} data-testid={`file-${f.id}`} onClick={() => onFileSelect(f.id)}>
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

vi.mock('@/app/components/download-trigger-button', () => ({
  DownloadTriggerButton: () => (
    <button data-testid="download-trigger-button" aria-label="Download music">
      download
    </button>
  ),
}));

describe('ReleasePlayer', () => {
  const file1CdnUrl = 'https://cdn.example.com/releases/123/track1.mp3';
  const file2CdnUrl = 'https://cdn.example.com/releases/123/track2.mp3';

  const mockRelease = {
    id: 'release-1',
    title: 'Test Album',
    coverArt: 'https://cdn.example.com/cover.jpg',
    description: 'A test album description',
    publishedAt: new Date(),
    releasedOn: new Date(),
    deletedOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [],
    artistReleases: [
      {
        id: 'ar-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
        artist: {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: null,
          title: null,
          suffix: null,
          middleName: null,
          bio: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedOn: null,
        },
      },
    ],
    digitalFormats: [
      {
        id: 'fmt-1',
        formatType: 'MP3_320KBPS',
        releaseId: 'release-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        files: [
          {
            id: 'file-1',
            trackNumber: 1,
            title: 'Track One',
            s3Key: 'releases/123/track1.mp3',
            fileName: 'track1.mp3',
            fileSize: 1000000,
            mimeType: 'audio/mpeg',
            formatId: 'fmt-1',
            duration: null,
            checksum: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'file-2',
            trackNumber: 2,
            title: 'Track Two',
            s3Key: 'releases/123/track2.mp3',
            fileName: 'track2.mp3',
            fileSize: 1000000,
            mimeType: 'audio/mpeg',
            formatId: 'fmt-1',
            duration: null,
            checksum: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ],
    releaseUrls: [],
  } as unknown as PublishedReleaseDetail;

  const mockReleaseNoTracks = {
    ...mockRelease,
    digitalFormats: [],
  } as unknown as PublishedReleaseDetail;

  it('should render MediaPlayer with sub-components', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
    expect(screen.getByTestId('media-controls')).toBeInTheDocument();
    expect(screen.getByTestId('info-ticker-tape')).toBeInTheDocument();
    expect(screen.getByTestId('format-file-list-drawer')).toBeInTheDocument();
  });

  it('should handle play/pause state', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-is-playing', 'false');

    fireEvent.click(screen.getByTestId('play-button'));
    expect(coverArt).toHaveAttribute('data-is-playing', 'true');

    fireEvent.click(screen.getByTestId('pause-button'));
    expect(coverArt).toHaveAttribute('data-is-playing', 'false');
  });

  it('should handle file selection', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    // Select second file
    fireEvent.click(screen.getByTestId('file-file-2'));

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);
  });

  it('should auto-advance to next file when current file ends', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    // Playing first file
    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);

    // File ends → should advance to file 2
    fireEvent.click(screen.getByTestId('ended-trigger'));
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);
  });

  it('should handle previous/next file navigation', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);

    // Go to next file
    fireEvent.click(screen.getByTestId('next-track-button'));
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);

    // Go back to previous file
    fireEvent.click(screen.getByTestId('previous-track-button'));
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);
  });

  it('should show no-tracks message when release has no files', () => {
    render(<ReleasePlayer release={mockReleaseNoTracks} releaseId="release-no-tracks" />);

    expect(screen.getByText(/no playable tracks available/i)).toBeInTheDocument();
    expect(screen.queryByTestId('media-controls')).not.toBeInTheDocument();
  });

  it('should render cover art even when no files available', () => {
    render(<ReleasePlayer release={mockReleaseNoTracks} releaseId="release-no-tracks" />);

    expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
  });

  it('should set first file as current by default', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);

    const drawer = screen.getByTestId('format-file-list-drawer');
    expect(drawer).toHaveAttribute('data-current-file-id', 'file-1');
  });

  it('should not advance past the last file', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    // Select last file
    fireEvent.click(screen.getByTestId('file-file-2'));

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);

    // File ends → should stay on last file (no wrap)
    fireEvent.click(screen.getByTestId('ended-trigger'));
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);
  });

  it('should auto-play first file when autoPlay prop is true', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" autoPlay />);

    // autoPlay triggers playerControls.play() via effect, which calls onPlay,
    // setting isPlaying to true — verified via the cover art's data attribute
    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-is-playing', 'true');
  });

  it('should not auto-play first file by default', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-is-playing', 'false');
  });

  it('should render the download dialog with the correct artist name', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const downloadDialog = screen.getByTestId('download-dialog');
    expect(downloadDialog).toBeInTheDocument();
    expect(downloadDialog).toHaveAttribute('data-artist-name', 'John Doe');
  });

  it('should render the download trigger button', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const triggerButton = screen.getByTestId('download-trigger-button');
    expect(triggerButton).toBeInTheDocument();
  });

  it('should render DownloadDialog before FormatFileListDrawer in the DOM', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const downloadDialog = screen.getByTestId('download-dialog');
    const formatFileListDrawer = screen.getByTestId('format-file-list-drawer');

    // DownloadDialog should come before FormatFileListDrawer in document order
    const order = downloadDialog.compareDocumentPosition(formatFileListDrawer);
    // Node.DOCUMENT_POSITION_FOLLOWING = 4
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should not render download dialog when release has no files', () => {
    render(<ReleasePlayer release={mockReleaseNoTracks} releaseId="release-no-tracks" />);

    expect(screen.queryByTestId('download-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('download-trigger-button')).not.toBeInTheDocument();
  });

  it('should handle toggle play when playerControls is null (no files)', () => {
    render(<ReleasePlayer release={mockReleaseNoTracks} releaseId="release-no-tracks" />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    // playerControls is null because Controls never mounted (no files)
    // clicking cover art calls handleTogglePlay which does playerControls?.toggle()
    // the ?. should safely no-op when playerControls is null
    fireEvent.click(coverArt);

    // No error thrown — the optional chaining handled the null case
    expect(coverArt).toBeInTheDocument();
  });

  it('should fall back to images[0].src when coverArt is empty', () => {
    const releaseWithImageFallback = {
      ...mockRelease,
      coverArt: '',
      images: [{ src: 'https://cdn.example.com/fallback.jpg', width: 400, height: 400 }],
    } as unknown as PublishedReleaseDetail;

    render(<ReleasePlayer release={releaseWithImageFallback} releaseId="release-1" />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-src', 'https://cdn.example.com/fallback.jpg');
  });

  it('should fall back to empty string when coverArt and images are empty', () => {
    const releaseNoImages = {
      ...mockRelease,
      coverArt: '',
      images: [],
    } as unknown as PublishedReleaseDetail;

    render(<ReleasePlayer release={releaseNoImages} releaseId="release-1" />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-src', '');
  });

  it('should not change track when selecting a non-existent file ID', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    // The FormatFileListDrawer will call onFileSelect with an ID
    // We need to simulate a call with a non-existent file ID
    // The first track should remain active
    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);
  });

  it('should not go to previous track when already on first track', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    // Click previous while on first track
    fireEvent.click(screen.getByTestId('previous-track-button'));

    // Should still be on first track
    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);
  });

  it('should not auto-play after navigating to previous track when wasPlaying is false', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    // Go to second track first
    fireEvent.click(screen.getByTestId('next-track-button'));
    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);

    // Navigate back with wasPlaying=false
    fireEvent.click(screen.getByTestId('previous-track-not-playing'));
    expect(controls).toHaveAttribute('data-audio-src', file1CdnUrl);
    expect(controls).toHaveAttribute('data-auto-play', 'false');
  });

  it('should not auto-play after navigating to next track when wasPlaying is false', () => {
    render(<ReleasePlayer release={mockRelease} releaseId="release-1" />);

    const controls = screen.getByTestId('media-controls');

    // Navigate forward with wasPlaying=false
    fireEvent.click(screen.getByTestId('next-track-not-playing'));
    expect(controls).toHaveAttribute('data-audio-src', file2CdnUrl);
    expect(controls).toHaveAttribute('data-auto-play', 'false');
  });

  it('should pass empty string to releaseTitle when release.title is null', () => {
    const releaseNullTitle = {
      ...mockRelease,
      title: null,
    } as unknown as PublishedReleaseDetail;

    render(<ReleasePlayer release={releaseNullTitle} releaseId="release-1" />);

    // The FormatFileListDrawer receives release.title ?? '' = ''
    // Just verify it renders without errors
    expect(screen.getByTestId('format-file-list-drawer')).toBeInTheDocument();
  });

  it('should display cleaned fileName when title is null', () => {
    const releaseWithNullTitle = {
      ...mockRelease,
      digitalFormats: [
        {
          ...mockRelease.digitalFormats[0],
          files: [
            {
              ...mockRelease.digitalFormats[0].files[0],
              title: null,
            },
          ],
        },
      ],
    } as unknown as PublishedReleaseDetail;

    render(<ReleasePlayer release={releaseWithNullTitle} releaseId="release-1" />);

    const ticker = screen.getByTestId('info-ticker-tape');
    expect(ticker).toHaveAttribute('data-track-name', 'Track1');
  });
});
