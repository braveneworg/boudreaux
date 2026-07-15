/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistListRow } from '@/lib/types/domain/playlist';

import { PlaylistRow } from './playlist-row';

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

interface ActionsStubProps {
  row: PlaylistListRow;
  onEdit: () => void;
  onPlay: () => void;
  onShare: () => void;
  onDelete: () => void;
}

vi.mock('./playlist-row-actions', () => ({
  PlaylistRowActions: ({ row, onEdit, onPlay, onShare, onDelete }: ActionsStubProps) => (
    <span data-testid="row-actions" data-row-id={row.id}>
      <button type="button" onClick={onPlay}>
        stub-play
      </button>
      <button type="button" onClick={onShare}>
        stub-share
      </button>
      <button type="button" onClick={onEdit}>
        stub-edit
      </button>
      <button type="button" onClick={onDelete}>
        stub-delete
      </button>
    </span>
  ),
}));

const makeRow = (overrides: Partial<PlaylistListRow> = {}): PlaylistListRow => ({
  id: 'pl-1',
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...overrides,
});

type RowProps = Parameters<typeof PlaylistRow>[0];

const renderRow = (overrides: Partial<RowProps> = {}) => {
  const props: RowProps = {
    row: makeRow(),
    onEdit: vi.fn(),
    onPlay: vi.fn(),
    onShare: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(
    <ul>
      <PlaylistRow {...props} />
    </ul>
  );
  return { ...view, props };
};

describe('PlaylistRow', () => {
  describe('layout', () => {
    it('renders as a list item', () => {
      renderRow();

      expect(screen.getByRole('listitem')).toBeInTheDocument();
    });

    it('renders the playlist title', () => {
      renderRow();

      expect(screen.getByText('Road Trip')).toBeInTheDocument();
    });

    it('truncates the title', () => {
      renderRow();

      expect(screen.getByText('Road Trip')).toHaveClass('truncate');
    });
  });

  describe('meta line', () => {
    it('renders the plural item count with the Private label', () => {
      renderRow();

      expect(screen.getByText('3 items · Private')).toBeInTheDocument();
    });

    it('renders a singular item count for one item', () => {
      renderRow({ row: makeRow({ itemCount: 1 }) });

      expect(screen.getByText('1 item · Private')).toBeInTheDocument();
    });

    it('renders the Public label for public playlists', () => {
      renderRow({ row: makeRow({ isPublic: true }) });

      expect(screen.getByText('3 items · Public')).toBeInTheDocument();
    });
  });

  describe('duration', () => {
    it('renders sub-hour durations as m:ss', () => {
      renderRow();

      expect(screen.getByText('9:00')).toBeInTheDocument();
    });

    it('renders hour-plus durations in long format', () => {
      renderRow({ row: makeRow({ totalDuration: 4210 }) });

      expect(screen.getByText('1:10:10')).toBeInTheDocument();
    });

    it('renders the duration with tabular numerals', () => {
      renderRow();

      expect(screen.getByText('9:00')).toHaveClass('tabular-nums');
    });
  });

  describe('cover tiles', () => {
    it('passes the row cover images to the tiles', () => {
      renderRow({
        row: makeRow({
          coverImages: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        }),
      });

      expect(screen.getByTestId('cover-tiles')).toHaveAttribute(
        'data-images',
        'https://cdn.example.com/a.jpg|https://cdn.example.com/b.jpg'
      );
    });

    it('renders the tiles at the small row size', () => {
      renderRow();

      expect(screen.getByTestId('cover-tiles')).toHaveAttribute('data-size', 'sm');
    });
  });

  describe('actions', () => {
    it('passes the row to the actions cluster', () => {
      renderRow();

      expect(screen.getByTestId('row-actions')).toHaveAttribute('data-row-id', 'pl-1');
    });

    it('forwards onPlay to the actions cluster', async () => {
      const user = userEvent.setup();
      const { props } = renderRow();

      await user.click(screen.getByRole('button', { name: 'stub-play' }));

      expect(props.onPlay).toHaveBeenCalledTimes(1);
    });

    it('forwards onShare to the actions cluster', async () => {
      const user = userEvent.setup();
      const { props } = renderRow();

      await user.click(screen.getByRole('button', { name: 'stub-share' }));

      expect(props.onShare).toHaveBeenCalledTimes(1);
    });

    it('forwards onEdit to the actions cluster', async () => {
      const user = userEvent.setup();
      const { props } = renderRow();

      await user.click(screen.getByRole('button', { name: 'stub-edit' }));

      expect(props.onEdit).toHaveBeenCalledTimes(1);
    });

    it('forwards onDelete to the actions cluster', async () => {
      const user = userEvent.setup();
      const { props } = renderRow();

      await user.click(screen.getByRole('button', { name: 'stub-delete' }));

      expect(props.onDelete).toHaveBeenCalledTimes(1);
    });
  });
});
