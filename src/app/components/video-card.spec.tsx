/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import type { VideoRow } from '@/lib/validation/video-schema';

import { VideoCard } from './video-card';

vi.mock('@/lib/utils/cdn-url', () => ({
  resolveStreamUrl: vi.fn(() => 'https://cdn.example.com/resolved.mp4'),
}));

// Render next/image as a plain <img> so boolean layout props (fill/unoptimized)
// do not warn and the poster src can be asserted directly.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

// Stub AddToPlaylistMenu: echo the built `item` (as JSON) and the `className`
// so tests can assert the media-item shape and the neutral header styling
// without exercising the real session-gated Radix popover.
vi.mock('./playlists/add-to-playlist-menu', () => ({
  AddToPlaylistMenu: ({ item, className }: { item: PlaylistSearchItem; className?: string }) => (
    <button
      type="button"
      aria-label="Add to a playlist"
      className={className}
      data-item={JSON.stringify(item)}
    >
      Add to playlist
    </button>
  ),
}));

// Sentinel modal: captures the props the card wires into the enlarged player
// without exercising Radix or the lazy video.js surface.
const dialogProps = vi.hoisted(
  (): {
    open?: boolean;
    title?: string;
    artist?: string;
    src?: string;
    posterUrl?: string | null;
    onOpenChange?: (open: boolean) => void;
    takeMediaEl?: () => HTMLVideoElement | null;
  } => ({})
);
vi.mock('@/components/ui/video/video-play-dialog', () => ({
  VideoPlayDialog: (props: {
    open: boolean;
    title: string;
    artist: string;
    src: string;
    posterUrl?: string | null;
    onOpenChange: (open: boolean) => void;
    takeMediaEl: () => HTMLVideoElement | null;
  }) => {
    Object.assign(dialogProps, props);
    return props.open
      ? createElement('div', { 'data-testid': 'play-dialog' }, `dialog:${props.title}`)
      : null;
  },
}));

const baseVideo: VideoRow = {
  id: 'video-1',
  title: 'Live at the Basement',
  artist: 'The Band',
  category: 'MUSIC',
  description: 'Behind-the-scenes notes',
  releasedOn: new Date(2026, 0, 15),
  durationSeconds: 200,
  s3Key: 'videos/live.mp4',
  fileName: 'live.mp4',
  fileSize: null,
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn.example.com/poster.jpg',
  publishedAt: new Date(2026, 0, 16),
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(2026, 0, 15),
  updatedAt: new Date(2026, 0, 15),
};

describe('VideoCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByRole('heading', { name: 'Live at the Basement' })).toBeInTheDocument();
  });

  it('renders the artist', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('The Band')).toBeInTheDocument();
  });

  it('does not render a category label for a music video', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.queryByText('Music')).not.toBeInTheDocument();
  });

  it('does not render a category label for an informational video', () => {
    render(<VideoCard video={{ ...baseVideo, category: 'INFORMATIONAL' }} />);

    expect(screen.queryByText('Informational')).not.toBeInTheDocument();
  });

  it('labels the release date', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('Release date:')).toBeInTheDocument();
  });

  it('renders the formatted release date', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('Jan 15, 2026')).toBeInTheDocument();
  });

  it('labels the duration', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('Duration:')).toBeInTheDocument();
  });

  it('renders the formatted duration', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('3:20')).toBeInTheDocument();
  });

  it('renders the description when present', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('Behind-the-scenes notes')).toBeInTheDocument();
  });

  it('omits the description when null', () => {
    render(<VideoCard video={{ ...baseVideo, description: null }} />);

    expect(screen.queryByText('Behind-the-scenes notes')).not.toBeInTheDocument();
  });

  it('renders the add-to-playlist menu', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByRole('button', { name: /add to a playlist/i })).toBeInTheDocument();
  });

  it('builds a video media item from the video row', () => {
    render(<VideoCard video={baseVideo} />);

    const menu = screen.getByRole('button', { name: /add to a playlist/i });
    const item = JSON.parse(menu.getAttribute('data-item') ?? '{}') as PlaylistSearchItem;

    expect(item.itemType).toBe('video');
    expect(item.source).toEqual({ videoId: 'video-1' });
    expect(item.title).toBe('Live at the Basement');
    expect(item.artistName).toBe('The Band');
  });

  it('passes the poster url as the media item cover art', () => {
    render(<VideoCard video={baseVideo} />);

    const menu = screen.getByRole('button', { name: /add to a playlist/i });
    const item = JSON.parse(menu.getAttribute('data-item') ?? '{}') as PlaylistSearchItem;

    expect(item.coverArt).toBe('https://cdn.example.com/poster.jpg');
  });

  it('falls back to null cover art when the poster url is absent', () => {
    render(<VideoCard video={{ ...baseVideo, posterUrl: null }} />);

    const menu = screen.getByRole('button', { name: /add to a playlist/i });
    const item = JSON.parse(menu.getAttribute('data-item') ?? '{}') as PlaylistSearchItem;

    expect(item.coverArt).toBeNull();
  });

  describe('poster frame', () => {
    it('exposes an accessible, labelled play button', () => {
      render(<VideoCard video={baseVideo} />);

      expect(screen.getByRole('button', { name: 'Play Live at the Basement' })).toBeInTheDocument();
    });

    it('shows the poster image inside the frame', () => {
      render(<VideoCard video={baseVideo} />);

      const button = screen.getByRole('button', { name: 'Play Live at the Basement' });

      expect(button.querySelector('img')).toHaveAttribute(
        'src',
        'https://cdn.example.com/poster.jpg'
      );
    });

    it('falls back to a placeholder when the poster url is absent', () => {
      render(<VideoCard video={{ ...baseVideo, posterUrl: null }} />);

      const button = screen.getByRole('button', { name: 'Play Live at the Basement' });

      expect(button.querySelector('img')).toBeNull();
    });

    it('disables the play button when the stream url is null', () => {
      vi.mocked(resolveStreamUrl).mockReturnValueOnce(null as never);

      render(<VideoCard video={baseVideo} />);

      expect(screen.getByRole('button', { name: 'Play Live at the Basement' })).toBeDisabled();
    });
  });

  describe('modal playback', () => {
    it('does not open the modal player before the poster is clicked', () => {
      render(<VideoCard video={baseVideo} />);

      expect(screen.queryByTestId('play-dialog')).not.toBeInTheDocument();
    });

    it('opens the modal player when the poster is clicked', async () => {
      const user = userEvent.setup();
      render(<VideoCard video={baseVideo} />);

      await user.click(screen.getByRole('button', { name: 'Play Live at the Basement' }));

      expect(screen.getByTestId('play-dialog')).toBeInTheDocument();
    });

    it('hands the modal the resolved stream url, artist, and poster', async () => {
      const user = userEvent.setup();
      render(<VideoCard video={baseVideo} />);

      await user.click(screen.getByRole('button', { name: 'Play Live at the Basement' }));

      expect(dialogProps).toMatchObject({
        src: 'https://cdn.example.com/resolved.mp4',
        artist: 'The Band',
        posterUrl: 'https://cdn.example.com/poster.jpg',
      });
    });

    it('primes a media element inside the poster click gesture', async () => {
      const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
      const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load');
      const user = userEvent.setup();
      render(<VideoCard video={baseVideo} />);

      await user.click(screen.getByRole('button', { name: 'Play Live at the Basement' }));

      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it('hands the modal a supplier holding the primed element', async () => {
      const user = userEvent.setup();
      render(<VideoCard video={baseVideo} />);

      await user.click(screen.getByRole('button', { name: 'Play Live at the Basement' }));

      expect(dialogProps.takeMediaEl?.()).toBeInstanceOf(HTMLVideoElement);
    });

    it('closes the modal when it requests close', async () => {
      const user = userEvent.setup();
      render(<VideoCard video={baseVideo} />);

      await user.click(screen.getByRole('button', { name: 'Play Live at the Basement' }));
      act(() => dialogProps.onOpenChange?.(false));

      expect(screen.queryByTestId('play-dialog')).not.toBeInTheDocument();
    });
  });
});
