/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistListRow, PlaylistsResponse } from '@/lib/types/domain/playlist';

import { PlaylistPickerCombobox } from './playlist-picker-combobox';

const usePlaylistsQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-playlists-query', () => ({
  usePlaylistsQuery: usePlaylistsQueryMock,
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

const makeRow = (id: string, title: string, coverImages: string[] = []): PlaylistListRow => ({
  id,
  title,
  isPublic: false,
  coverImages,
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const ROAD_TRIP = makeRow('pl-1', 'Road Trip', ['https://cdn.example.com/cover-1.jpg']);
const CHILL_MIX = makeRow('pl-2', 'Chill Mix');

const mockQueryState = ({
  isPending = false,
  data,
  error = new Error('Unknown error'),
}: {
  isPending?: boolean;
  data?: PlaylistsResponse;
  error?: Error;
}): void => {
  usePlaylistsQueryMock.mockReturnValue({ isPending, error, data, refetch: vi.fn() });
};

const mockRows = (rows: PlaylistListRow[]): void =>
  mockQueryState({ data: { rows, nextSkip: null } });

type PickerProps = Parameters<typeof PlaylistPickerCombobox>[0];

const renderPicker = (overrides: Partial<PickerProps> = {}) => {
  const props: PickerProps = { onPick: vi.fn(), ...overrides };
  return { ...render(<PlaylistPickerCombobox {...props} />), props };
};

const findPlaylistInput = (): HTMLElement => screen.getByPlaceholderText('Find a playlist…');

describe('PlaylistPickerCombobox', () => {
  describe('rendering', () => {
    it('renders the search input with the "Find a playlist…" placeholder', () => {
      mockRows([]);
      renderPicker();

      expect(findPlaylistInput()).toBeInTheDocument();
    });

    it('lists each playlist as an option named by its title', () => {
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderPicker();

      expect(screen.getByRole('option', { name: 'Road Trip' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Chill Mix' })).toBeInTheDocument();
    });

    it("renders small decorative cover tiles from each row's cover images", () => {
      mockRows([ROAD_TRIP]);
      renderPicker();

      const tiles = screen.getByTestId('cover-tiles');
      expect(tiles).toHaveAttribute('data-size', 'sm');
      expect(tiles).toHaveAttribute('data-images', 'https://cdn.example.com/cover-1.jpg');
      expect(tiles).toHaveAttribute('data-alt', '');
    });

    it('renders a Plus icon in each row', () => {
      mockRows([ROAD_TRIP]);
      renderPicker();

      const option = screen.getByRole('option', { name: 'Road Trip' });
      expect(option.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('capping', () => {
    it('caps the visible options at five', () => {
      mockRows(
        Array.from({ length: 6 }, (_, index) => makeRow(`pl-${index + 1}`, `Playlist ${index + 1}`))
      );
      renderPicker();

      expect(screen.getAllByRole('option')).toHaveLength(5);
      expect(screen.queryByRole('option', { name: 'Playlist 6' })).not.toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('filters options by the typed query, case-insensitively', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderPicker();

      await user.type(findPlaylistInput(), 'rOaD');

      expect(screen.getByRole('option', { name: 'Road Trip' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Chill Mix' })).not.toBeInTheDocument();
    });

    it('shows the empty message when the query matches nothing', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP]);
      renderPicker();

      await user.type(findPlaylistInput(), 'zzz');

      expect(screen.getByText('No playlists yet.')).toBeInTheDocument();
    });
  });

  describe('exclusion', () => {
    it('omits the playlist matching excludePlaylistId', () => {
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderPicker({ excludePlaylistId: 'pl-1' });

      expect(screen.queryByRole('option', { name: 'Road Trip' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Chill Mix' })).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('calls onPick with the full row payload when an option is clicked', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      const { props } = renderPicker();

      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      expect(props.onPick).toHaveBeenCalledTimes(1);
      expect(props.onPick).toHaveBeenCalledWith(ROAD_TRIP);
    });

    it('calls onPick with the keyboard-highlighted row when Enter is pressed', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      const { props } = renderPicker();

      await user.click(findPlaylistInput());
      await user.keyboard('{ArrowDown}{Enter}');

      expect(props.onPick).toHaveBeenCalledWith(CHILL_MIX);
    });
  });

  describe('query states', () => {
    it('shows "Loading…" while the playlists query is pending', () => {
      mockQueryState({ isPending: true });
      renderPicker();

      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('shows "No playlists yet." when the user has no playlists', () => {
      mockRows([]);
      renderPicker();

      expect(screen.getByText('No playlists yet.')).toBeInTheDocument();
    });

    it('falls back to the empty message when the query errors', () => {
      mockQueryState({ error: new Error('Failed to fetch playlists') });
      renderPicker();

      expect(screen.getByText('No playlists yet.')).toBeInTheDocument();
    });
  });
});
