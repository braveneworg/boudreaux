/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

import type { PlaylistListRow } from '@/lib/types/domain/playlist';

import { PlaylistRowActions } from './playlist-row-actions';

const ROW: PlaylistListRow = {
  id: 'pl-1',
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

type ActionsProps = Parameters<typeof PlaylistRowActions>[0];

const renderActions = (overrides: Partial<ActionsProps> = {}) => {
  const props: ActionsProps = {
    row: ROW,
    onEdit: vi.fn(),
    onPlay: vi.fn(),
    onShare: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaylistRowActions {...props} />), props };
};

const openDeleteConfirm = async (user: UserEvent): Promise<void> =>
  user.click(screen.getByRole('button', { name: 'Delete playlist' }));

describe('PlaylistRowActions', () => {
  describe('rendering', () => {
    it('renders the "Play playlist" button', () => {
      renderActions();

      expect(screen.getByRole('button', { name: 'Play playlist' })).toBeInTheDocument();
    });

    it('renders the "Share playlist" button', () => {
      renderActions();

      expect(screen.getByRole('button', { name: 'Share playlist' })).toBeInTheDocument();
    });

    it('renders the "Edit playlist" button', () => {
      renderActions();

      expect(screen.getByRole('button', { name: 'Edit playlist' })).toBeInTheDocument();
    });

    it('renders the "Delete playlist" button', () => {
      renderActions();

      expect(screen.getByRole('button', { name: 'Delete playlist' })).toBeInTheDocument();
    });

    it('renders the actions in Play, Share, Edit, Delete order', () => {
      renderActions();

      const labels = screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));
      expect(labels).toEqual([
        'Play playlist',
        'Share playlist',
        'Edit playlist',
        'Delete playlist',
      ]);
    });
  });

  describe('callbacks', () => {
    it('fires onPlay once when the play button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderActions();

      await user.click(screen.getByRole('button', { name: 'Play playlist' }));

      expect(props.onPlay).toHaveBeenCalledTimes(1);
    });

    it('fires onShare once when the share button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderActions();

      await user.click(screen.getByRole('button', { name: 'Share playlist' }));

      expect(props.onShare).toHaveBeenCalledTimes(1);
    });

    it('fires onEdit once when the edit button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderActions();

      await user.click(screen.getByRole('button', { name: 'Edit playlist' }));

      expect(props.onEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete confirmation', () => {
    it('opens a confirm dialog naming the playlist from the trash button', async () => {
      const user = userEvent.setup();
      renderActions();

      await openDeleteConfirm(user);

      expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete "Road Trip"?');
    });

    it('warns that the deletion is irreversible', async () => {
      const user = userEvent.setup();
      renderActions();

      await openDeleteConfirm(user);

      expect(screen.getByRole('alertdialog')).toHaveTextContent("This can't be undone.");
    });

    it('does not fire onDelete before the dialog is confirmed', async () => {
      const user = userEvent.setup();
      const { props } = renderActions();

      await openDeleteConfirm(user);

      expect(props.onDelete).not.toHaveBeenCalled();
    });

    it('fires onDelete once when the deletion is confirmed', async () => {
      const user = userEvent.setup();
      const { props } = renderActions();

      await openDeleteConfirm(user);
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(props.onDelete).toHaveBeenCalledTimes(1);
    });

    it('does not fire onDelete when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      const { props } = renderActions();

      await openDeleteConfirm(user);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(props.onDelete).not.toHaveBeenCalled();
    });
  });
});
