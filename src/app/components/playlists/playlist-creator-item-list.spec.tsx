/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildDragEndHandler, PlaylistCreatorItemList } from './playlist-creator-item-list';

import type { PlaylistCreatorItemData } from './playlist-creator-item';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span data-src={props.src as string} data-testid="next-image" />
  ),
}));

const item = (id: string, title: string): PlaylistCreatorItemData => ({
  id,
  title,
  artistName: 'Ceschi',
  duration: 125,
  coverArt: null,
  isVideo: false,
});

const ITEMS: PlaylistCreatorItemData[] = [
  item('a', 'Alpha'),
  item('b', 'Bravo'),
  item('c', 'Charlie'),
];

type ListProps = Parameters<typeof PlaylistCreatorItemList>[0];

const renderList = (overrides: Partial<ListProps> = {}) => {
  const props: ListProps = { items: ITEMS, onReorder: vi.fn(), onRemove: vi.fn(), ...overrides };
  const view = render(<PlaylistCreatorItemList {...props} />);
  return { ...view, props };
};

describe('buildDragEndHandler', () => {
  it('calls onReorder with the moved order when dropped later in the list', () => {
    const onReorder = vi.fn();
    const handler = buildDragEndHandler({ itemIds: ['a', 'b', 'c'], onReorder });

    handler({ active: { id: 'a' }, over: { id: 'c' } });

    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('calls onReorder with the moved order when dropped earlier in the list', () => {
    const onReorder = vi.fn();
    const handler = buildDragEndHandler({ itemIds: ['a', 'b', 'c'], onReorder });

    handler({ active: { id: 'c' }, over: { id: 'a' } });

    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('does not call onReorder when there is no drop target', () => {
    const onReorder = vi.fn();
    const handler = buildDragEndHandler({ itemIds: ['a', 'b', 'c'], onReorder });

    handler({ active: { id: 'a' }, over: null });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder when the item is dropped on itself', () => {
    const onReorder = vi.fn();
    const handler = buildDragEndHandler({ itemIds: ['a', 'b', 'c'], onReorder });

    handler({ active: { id: 'b' }, over: { id: 'b' } });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder when the dragged id is not in the list', () => {
    const onReorder = vi.fn();
    const handler = buildDragEndHandler({ itemIds: ['a', 'b', 'c'], onReorder });

    handler({ active: { id: 'ghost' }, over: { id: 'a' } });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not call onReorder when the drop target id is not in the list', () => {
    const onReorder = vi.fn();
    const handler = buildDragEndHandler({ itemIds: ['a', 'b', 'c'], onReorder });

    handler({ active: { id: 'a' }, over: { id: 'ghost' } });

    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe('PlaylistCreatorItemList', () => {
  it('renders one row per item', () => {
    renderList();

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the rows in the given order', () => {
    renderList();

    const titles = screen
      .getAllByRole('listitem')
      .map((row) => within(row).getByText(/^(Alpha|Bravo|Charlie)$/).textContent);
    expect(titles).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it("fires onRemove with the row's id after the confirm dialog is accepted", async () => {
    const user = userEvent.setup();
    const { props } = renderList();

    await user.click(screen.getByRole('button', { name: 'Remove Bravo' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(props.onRemove).toHaveBeenCalledWith('b');
  });

  it('does not fire onRemove when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const { props } = renderList();

    await user.click(screen.getByRole('button', { name: 'Remove Bravo' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onRemove).not.toHaveBeenCalled();
  });
});
