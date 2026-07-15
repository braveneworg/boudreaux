/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Command, CommandList } from '@/components/ui/command';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { PlaylistSearchResultRow } from './playlist-search-result-row';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span
      data-alt={props.alt as string}
      data-height={props.height as number}
      data-sizes={props.sizes as string}
      data-src={props.src as string}
      data-testid="next-image"
      data-width={props.width as number}
    />
  ),
}));

const TRACK_ITEM: PlaylistSearchItem = {
  key: 'track:tf-1',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: 'https://cdn.example.com/cover-1.jpg',
  duration: 125,
  source: { trackFileId: 'tf-1', releaseId: 'rel-1' },
};

const VIDEO_ITEM: PlaylistSearchItem = {
  key: 'video:v-1',
  itemType: 'video',
  title: 'Live at the Fest',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 240,
  source: { videoId: 'v-1' },
  context: 'Official video',
};

type RowProps = Parameters<typeof PlaylistSearchResultRow>[0];

const renderRow = (item: PlaylistSearchItem, overrides: Partial<RowProps> = {}) => {
  const props: RowProps = {
    item,
    onAdd: vi.fn(),
    onNewPlaylist: vi.fn(),
    onAddToOther: vi.fn(),
    ...overrides,
  };
  const view = render(
    <Command shouldFilter={false}>
      <CommandList>
        <PlaylistSearchResultRow {...props} />
      </CommandList>
    </Command>
  );
  return { ...view, props };
};

describe('PlaylistSearchResultRow', () => {
  describe('rendering', () => {
    it('renders the item as a selectable option named by its title', () => {
      renderRow(TRACK_ITEM);

      expect(screen.getByRole('option', { name: /Cold Wind/ })).toBeInTheDocument();
    });

    it('renders a leading icon in the row', () => {
      renderRow(TRACK_ITEM);

      const option = screen.getByRole('option', { name: /Cold Wind/ });
      expect(option.querySelector('svg')).toBeInTheDocument();
    });

    it('shows the "video" pill for video items', () => {
      renderRow(VIDEO_ITEM);

      expect(screen.getByText('video')).toBeInTheDocument();
    });

    it('does not show the "video" pill for track items', () => {
      renderRow(TRACK_ITEM);

      expect(screen.queryByText('video')).not.toBeInTheDocument();
    });

    it('formats the duration as m:ss', () => {
      renderRow(TRACK_ITEM);

      expect(screen.getByText('2:05')).toBeInTheDocument();
    });

    it('renders the context as subtext when present', () => {
      renderRow(VIDEO_ITEM);

      expect(screen.getByText('Official video')).toBeInTheDocument();
    });

    it('falls back to the artist name subtext when context is absent', () => {
      renderRow(TRACK_ITEM);

      expect(screen.getByText('Ceschi')).toBeInTheDocument();
    });
  });

  describe('thumbnail', () => {
    it('renders a 40px cover image when coverArt is set', () => {
      renderRow(TRACK_ITEM);

      const image = screen.getByTestId('next-image');
      expect(image).toHaveAttribute('data-src', 'https://cdn.example.com/cover-1.jpg');
      expect(image).toHaveAttribute('data-width', '40');
      expect(image).toHaveAttribute('data-height', '40');
    });

    it('renders no image when coverArt is null', () => {
      renderRow(VIDEO_ITEM);

      expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    });

    it('renders a muted fallback block when coverArt is null', () => {
      const { container } = renderRow(VIDEO_ITEM);

      expect(container.querySelector('.bg-zinc-200')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('fires onAdd when the row is selected', async () => {
      const user = userEvent.setup();
      const { props } = renderRow(TRACK_ITEM);

      await user.click(screen.getByRole('option', { name: /Cold Wind/ }));

      expect(props.onAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe('secondary actions', () => {
    it('fires onNewPlaylist from the "New playlist from this song" button', async () => {
      const user = userEvent.setup();
      const { props } = renderRow(TRACK_ITEM);

      await user.click(screen.getByRole('button', { name: 'New playlist from this song' }));

      expect(props.onNewPlaylist).toHaveBeenCalledTimes(1);
    });

    it('does not bubble the new-playlist click into a row select', async () => {
      const user = userEvent.setup();
      const { props } = renderRow(TRACK_ITEM);

      await user.click(screen.getByRole('button', { name: 'New playlist from this song' }));

      expect(props.onAdd).not.toHaveBeenCalled();
    });

    it('fires onAddToOther from the "Add to another playlist" button', async () => {
      const user = userEvent.setup();
      const { props } = renderRow(TRACK_ITEM);

      await user.click(screen.getByRole('button', { name: 'Add to another playlist' }));

      expect(props.onAddToOther).toHaveBeenCalledTimes(1);
    });

    it('does not bubble the add-to-other click into a row select', async () => {
      const user = userEvent.setup();
      const { props } = renderRow(TRACK_ITEM);

      await user.click(screen.getByRole('button', { name: 'Add to another playlist' }));

      expect(props.onAdd).not.toHaveBeenCalled();
    });

    it('stops pointerdown propagation from both secondary buttons', async () => {
      const user = userEvent.setup();
      const onPointerDown = vi.fn();
      render(
        // Plain probe wrapper: asserts the buttons contain pointerdown so
        // outer layers (popovers, drawers) never see it.
        <div data-testid="pointer-probe" onPointerDown={onPointerDown}>
          <Command shouldFilter={false}>
            <CommandList>
              <PlaylistSearchResultRow
                item={TRACK_ITEM}
                onAdd={vi.fn()}
                onAddToOther={vi.fn()}
                onNewPlaylist={vi.fn()}
              />
            </CommandList>
          </Command>
        </div>
      );

      await user.pointer([
        {
          keys: '[MouseLeft>]',
          target: screen.getByRole('button', { name: 'New playlist from this song' }),
        },
        { keys: '[/MouseLeft]' },
        {
          keys: '[MouseLeft>]',
          target: screen.getByRole('button', { name: 'Add to another playlist' }),
        },
        { keys: '[/MouseLeft]' },
      ]);

      expect(onPointerDown).not.toHaveBeenCalled();
    });
  });
});
