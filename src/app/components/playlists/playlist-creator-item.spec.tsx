/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

import { PlaylistCreatorItem } from './playlist-creator-item';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span data-src={props.src as string} data-testid="next-image" />
  ),
}));

type ItemProps = Parameters<typeof PlaylistCreatorItem>[0];

const BASE_PROPS: Omit<ItemProps, 'onRemove'> = {
  id: 'item-1',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  duration: 125,
  coverArt: null,
  isVideo: false,
};

const renderItem = (overrides: Partial<ItemProps> = {}) => {
  const props: ItemProps = { ...BASE_PROPS, onRemove: vi.fn(), ...overrides };
  const view = render(
    <DndContext>
      <SortableContext items={[props.id]} strategy={verticalListSortingStrategy}>
        <ul>
          <PlaylistCreatorItem {...props} />
        </ul>
      </SortableContext>
    </DndContext>
  );
  return { ...view, props };
};

const openRemoveConfirm = async (user: UserEvent): Promise<void> =>
  user.click(screen.getByRole('button', { name: 'Remove Cold Wind' }));

describe('PlaylistCreatorItem', () => {
  describe('display', () => {
    it('renders the title', () => {
      renderItem();

      expect(screen.getByText('Cold Wind')).toBeInTheDocument();
    });

    it('renders the artist name', () => {
      renderItem();

      expect(screen.getByText('Ceschi')).toBeInTheDocument();
    });

    it('renders the formatted duration', () => {
      renderItem();

      expect(screen.getByText('2:05')).toBeInTheDocument();
    });

    it('renders the video badge for video items', () => {
      renderItem({ isVideo: true });

      expect(screen.getByText('video')).toBeInTheDocument();
    });

    it('renders no video badge for track items', () => {
      renderItem();

      expect(screen.queryByText('video')).not.toBeInTheDocument();
    });

    it('renders the cover thumb when coverArt is set', () => {
      renderItem({ coverArt: 'https://cdn.example/cover.jpg' });

      expect(screen.getByTestId('next-image')).toHaveAttribute(
        'data-src',
        'https://cdn.example/cover.jpg'
      );
    });

    it('renders a fallback block instead of an image when coverArt is null', () => {
      renderItem();

      expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    });

    it('renders no artist line when artistName is null', () => {
      renderItem({ artistName: null });

      expect(screen.queryByText('Ceschi')).not.toBeInTheDocument();
    });
  });

  describe('drag handle', () => {
    it('exposes an accessible reorder handle naming the item', () => {
      renderItem();

      expect(screen.getByRole('button', { name: 'Reorder Cold Wind' })).toBeInTheDocument();
    });

    it('marks the row as dragging while a keyboard drag is active', async () => {
      const user = userEvent.setup();
      renderItem();

      const handle = screen.getByRole('button', { name: 'Reorder Cold Wind' });
      handle.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByRole('listitem')).toHaveClass('opacity-70');
    });
  });

  describe('remove confirmation', () => {
    it('opens the "Remove from playlist?" confirm dialog from the trash button', async () => {
      const user = userEvent.setup();
      renderItem();

      await openRemoveConfirm(user);

      expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove from playlist?');
    });

    it('does not fire onRemove before the dialog is confirmed', async () => {
      const user = userEvent.setup();
      const { props } = renderItem();

      await openRemoveConfirm(user);

      expect(props.onRemove).not.toHaveBeenCalled();
    });

    it('fires onRemove once when the removal is confirmed', async () => {
      const user = userEvent.setup();
      const { props } = renderItem();

      await openRemoveConfirm(user);
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(props.onRemove).toHaveBeenCalledTimes(1);
    });

    it('does not fire onRemove when the dialog is cancelled', async () => {
      const user = userEvent.setup();
      const { props } = renderItem();

      await openRemoveConfirm(user);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(props.onRemove).not.toHaveBeenCalled();
    });
  });
});
