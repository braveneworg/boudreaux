/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistDetailResponse, PlaylistItemPayload } from '@/lib/types/domain/playlist';

import { PlaylistView } from './playlist-view';

const usePlaylistQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-playlist-query', () => ({
  usePlaylistQuery: usePlaylistQueryMock,
}));

interface TilesStubProps {
  images: string[];
  alt: string;
  size?: 'sm' | 'lg';
}

vi.mock('./playlist-cover-tiles', () => ({
  PlaylistCoverTiles: ({ images, alt, size }: TilesStubProps) => (
    <span
      data-testid="cover-tiles"
      data-images={images.join('|')}
      data-alt={alt}
      data-size={size}
    />
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="item-thumb" data-src={src} data-alt={alt} />
  ),
}));

const makeItem = (overrides: Partial<PlaylistItemPayload> = {}): PlaylistItemPayload => ({
  id: 'item-1',
  itemType: 'track',
  sortOrder: 1,
  title: 'Song One',
  artistName: 'Artist A',
  duration: 215,
  available: true,
  trackFileId: 'tf-1',
  releaseId: 'rel-1',
  releaseTitle: 'Album',
  videoId: null,
  coverArt: null,
  s3Key: null,
  streamUrl: null,
  posterUrl: null,
  ...overrides,
});

const DETAIL: PlaylistDetailResponse = {
  id: 'pl-1',
  title: 'Road Trip Mix',
  isPublic: false,
  isOwner: true,
  coverImages: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  itemCount: 2,
  totalDuration: 430,
  items: [
    makeItem({
      id: 'item-2',
      sortOrder: 2,
      title: 'Video Two',
      itemType: 'video',
      videoId: 'vid-1',
      trackFileId: null,
      duration: 95,
      coverArt: 'https://cdn.example.com/thumb.jpg',
    }),
    makeItem(),
  ],
};

const mockQueryState = ({
  isPending = false,
  data,
}: {
  isPending?: boolean;
  data?: PlaylistDetailResponse;
}): void => {
  usePlaylistQueryMock.mockReturnValue({
    isPending,
    error: new Error('Unknown error'),
    data,
    refetch: vi.fn(),
  });
};

type ViewProps = Parameters<typeof PlaylistView>[0];

const renderView = (overrides: Partial<ViewProps> = {}) => {
  const props: ViewProps = {
    playlistId: 'pl-1',
    onBackToCreator: vi.fn(),
    onEdit: vi.fn(),
    onPlay: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaylistView {...props} />), props };
};

describe('PlaylistView', () => {
  describe('states', () => {
    it('renders three skeleton lines while the detail loads', () => {
      mockQueryState({ isPending: true });
      renderView();

      expect(screen.getAllByTestId('playlist-view-skeleton')).toHaveLength(3);
    });

    it('renders a muted error line when the detail query settles without data', () => {
      mockQueryState({});
      renderView();

      expect(screen.getByText("Couldn't load playlist.")).toBeInTheDocument();
    });
  });

  describe('toggle', () => {
    it('offers Creator and the playlist title as toggle segments', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      expect(screen.getByRole('radio', { name: 'Creator' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Road Trip Mix' })).toBeInTheDocument();
    });

    it('fires onBackToCreator when the Creator segment is chosen', async () => {
      const user = userEvent.setup();
      mockQueryState({ data: DETAIL });
      const { props } = renderView();

      await user.click(screen.getByRole('radio', { name: 'Creator' }));

      expect(props.onBackToCreator).toHaveBeenCalledTimes(1);
    });

    it('does not fire onBackToCreator when the playlist segment is re-selected', async () => {
      const user = userEvent.setup();
      mockQueryState({ data: DETAIL });
      const { props } = renderView();

      await user.click(screen.getByRole('radio', { name: 'Road Trip Mix' }));

      expect(props.onBackToCreator).not.toHaveBeenCalled();
    });
  });

  describe('detail rendering', () => {
    it('renders the large cover mosaic from the playlist covers', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      const tiles = screen.getByTestId('cover-tiles');
      expect(tiles).toHaveAttribute('data-size', 'lg');
      expect(tiles).toHaveAttribute(
        'data-images',
        'https://cdn.example.com/a.jpg|https://cdn.example.com/b.jpg'
      );
    });

    it('renders the title heading with the item-count and visibility meta', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      expect(screen.getByRole('heading', { name: 'Road Trip Mix' })).toBeInTheDocument();
      expect(screen.getByText('2 items · Private')).toBeInTheDocument();
    });

    it('renders singular and Public meta variants', () => {
      mockQueryState({
        data: { ...DETAIL, isPublic: true, itemCount: 1, items: [makeItem()] },
      });
      renderView();

      expect(screen.getByText('1 item · Public')).toBeInTheDocument();
    });

    it('fires onPlay with the playlist id from the Play button', async () => {
      const user = userEvent.setup();
      mockQueryState({ data: DETAIL });
      const { props } = renderView();

      await user.click(screen.getByRole('button', { name: 'Play playlist' }));

      expect(props.onPlay).toHaveBeenCalledExactlyOnceWith('pl-1');
    });

    it('fires onEdit with the playlist id from the Edit button', async () => {
      const user = userEvent.setup();
      mockQueryState({ data: DETAIL });
      const { props } = renderView();

      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));

      expect(props.onEdit).toHaveBeenCalledExactlyOnceWith('pl-1');
    });
  });

  describe('item list', () => {
    it('renders the items ordered by sortOrder', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Song One');
      expect(items[1]).toHaveTextContent('Video Two');
    });

    it('marks video items with a video badge', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      const items = screen.getAllByRole('listitem');
      expect(within(items[0]).queryByText('video')).not.toBeInTheDocument();
      expect(within(items[1]).getByText('video')).toBeInTheDocument();
    });

    it('renders each item duration through formatDuration', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      expect(screen.getByText('3:35')).toBeInTheDocument();
      expect(screen.getByText('1:35')).toBeInTheDocument();
    });

    it('renders a cover thumb when the item has art and a muted fallback otherwise', () => {
      mockQueryState({ data: DETAIL });
      renderView();

      const items = screen.getAllByRole('listitem');
      expect(within(items[0]).queryByTestId('item-thumb')).not.toBeInTheDocument();
      expect(within(items[1]).getByTestId('item-thumb')).toHaveAttribute(
        'data-src',
        'https://cdn.example.com/thumb.jpg'
      );
    });
  });
});
