/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistListRow } from '@/lib/types/domain/playlist';

import { MyPlaylistSearch } from './my-playlist-search';

const usePlaylistsQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-playlists-query', () => ({
  usePlaylistsQuery: usePlaylistsQueryMock,
}));

const makeRow = (id: string, title: string): PlaylistListRow => ({
  id,
  title,
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const ROAD_TRIP = makeRow('pl-1', 'Road Trip');
const CHILL_MIX = makeRow('pl-2', 'Chill Mix');

const mockQueryState = ({
  isPending = false,
  rows,
}: {
  isPending?: boolean;
  rows?: PlaylistListRow[];
}): void => {
  usePlaylistsQueryMock.mockReturnValue({
    isPending,
    error: new Error('Unknown error'),
    rows,
    nextSkip: null,
    loadMore: vi.fn(),
    isLoadingMore: false,
    refetch: vi.fn(),
  });
};

const mockRows = (rows: PlaylistListRow[]): void => mockQueryState({ rows });

type SearchProps = Parameters<typeof MyPlaylistSearch>[0];

const renderSearch = (overrides: Partial<SearchProps> = {}) => {
  const props: SearchProps = { onSelect: vi.fn(), ...overrides };
  return { ...render(<MyPlaylistSearch {...props} />), props };
};

const findTrigger = (): HTMLElement =>
  screen.getByRole('button', { name: 'Search your playlists' });

const findCommandInput = (): HTMLElement | null =>
  screen.queryByPlaceholderText('Search your playlists…');

describe('MyPlaylistSearch', () => {
  describe('trigger', () => {
    it('renders a button styled as a search input with the placeholder copy', () => {
      mockRows([]);
      renderSearch();

      expect(findTrigger()).toHaveTextContent('Search your playlists…');
    });

    it('composes the className prop onto the trigger', () => {
      mockRows([]);
      renderSearch({ className: 'lg:hidden' });

      expect(findTrigger()).toHaveClass('lg:hidden');
    });

    it('does not render the command input until opened', () => {
      mockRows([ROAD_TRIP]);
      renderSearch();

      expect(findCommandInput()).not.toBeInTheDocument();
    });
  });

  describe('open popover', () => {
    it('opens a command palette with a search input on click', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP]);
      renderSearch();

      await user.click(findTrigger());

      expect(findCommandInput()).toBeInTheDocument();
    });

    it('lists each playlist as an option named by its title', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderSearch();

      await user.click(findTrigger());

      expect(screen.getByRole('option', { name: 'Road Trip' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Chill Mix' })).toBeInTheDocument();
    });

    it('lists rows carried over from a second loaded page', async () => {
      const user = userEvent.setup();
      const secondPageRow = makeRow('pl-3', 'Deep Cuts');
      // rows here are already flattened across both loaded pages by the hook.
      mockRows([ROAD_TRIP, CHILL_MIX, secondPageRow]);
      renderSearch();

      await user.click(findTrigger());

      expect(screen.getByRole('option', { name: 'Deep Cuts' })).toBeInTheDocument();
    });

    it('shows "No playlists yet." when the user has no playlists', async () => {
      const user = userEvent.setup();
      mockRows([]);
      renderSearch();

      await user.click(findTrigger());
      await user.type(screen.getByPlaceholderText('Search your playlists…'), 'a');

      expect(screen.getByText('No playlists yet.')).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('filters options by title with cmdk default filtering', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      renderSearch();

      await user.click(findTrigger());
      await user.type(screen.getByPlaceholderText('Search your playlists…'), 'chill');

      expect(screen.getByRole('option', { name: 'Chill Mix' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Road Trip' })).not.toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('fires onSelect with the row id when an option is clicked', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP, CHILL_MIX]);
      const { props } = renderSearch();

      await user.click(findTrigger());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('pl-1');
    });

    it('closes the popover after a selection', async () => {
      const user = userEvent.setup();
      mockRows([ROAD_TRIP]);
      renderSearch();

      await user.click(findTrigger());
      await user.click(screen.getByRole('option', { name: 'Road Trip' }));

      expect(findCommandInput()).not.toBeInTheDocument();
    });
  });
});
