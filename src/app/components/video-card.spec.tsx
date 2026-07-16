/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import type { VideoRow } from '@/lib/validation/video-schema';

import { VideoCard } from './video-card';

vi.mock('@/lib/utils/cdn-url', () => ({
  resolveStreamUrl: vi.fn(() => 'https://cdn.example.com/resolved.mp4'),
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

vi.mock('@/components/ui/video/video-player', () => ({
  VideoPlayer: ({
    title,
    src,
    posterUrl,
  }: {
    title: string;
    src: string | null;
    posterUrl?: string | null;
  }) => (
    <div
      data-testid="video-player"
      data-title={title}
      data-src={src ?? 'null'}
      data-poster={posterUrl ?? 'null'}
    />
  ),
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
  it('renders the title', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByRole('heading', { name: 'Live at the Basement' })).toBeInTheDocument();
  });

  it('renders the artist', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('The Band')).toBeInTheDocument();
  });

  it('labels a music video as Music', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('Music')).toBeInTheDocument();
  });

  it('labels an informational video as Informational', () => {
    render(<VideoCard video={{ ...baseVideo, category: 'INFORMATIONAL' }} />);

    expect(screen.getByText('Informational')).toBeInTheDocument();
  });

  it('renders the formatted release date', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByText('Jan 15, 2026')).toBeInTheDocument();
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

  it('passes the resolved stream url to the player', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByTestId('video-player')).toHaveAttribute(
      'data-src',
      'https://cdn.example.com/resolved.mp4'
    );
  });

  it('resolves the stream url from the video row', () => {
    render(<VideoCard video={baseVideo} />);

    expect(resolveStreamUrl).toHaveBeenCalledWith(baseVideo);
  });

  it('passes the poster url to the player', () => {
    render(<VideoCard video={baseVideo} />);

    expect(screen.getByTestId('video-player')).toHaveAttribute(
      'data-poster',
      'https://cdn.example.com/poster.jpg'
    );
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
});
