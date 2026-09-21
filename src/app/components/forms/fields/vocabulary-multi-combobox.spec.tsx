/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ArtistVocabularyEntry } from '@/lib/types/domain/artist';

import { VocabularyMultiCombobox } from './vocabulary-multi-combobox';

// --------------------------------------------------------------------------
// Mock: useArtistVocabularyQuery
// --------------------------------------------------------------------------
let mockResults: ArtistVocabularyEntry[] = [];
let mockIsPending = false;

vi.mock('../_hooks/use-artist-vocabulary-query', () => ({
  useArtistVocabularyQuery: () => ({
    isPending: mockIsPending,
    error: null,
    data: mockResults,
    refetch: vi.fn(),
  }),
}));

// Return the debounced value immediately — no timer tricks needed.
vi.mock('@/hooks/use-debounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// @dnd-kit needs real layout; render its children and capture onDragEnd so the
// reorder path can be driven directly.
const dragEnd = vi.hoisted(() => ({
  current: undefined as ((event: unknown) => void) | undefined,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (event: unknown) => void;
  }) => {
    dragEnd.current = onDragEnd;
    return <div>{children}</div>;
  },
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  arrayMove: <T,>(items: T[], from: number, to: number): T[] => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  },
  sortableKeyboardCoordinates: vi.fn(),
  horizontalListSortingStrategy: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const setup = (props: Partial<React.ComponentProps<typeof VocabularyMultiCombobox>> = {}) => {
  const onChange = vi.fn();
  render(
    <VocabularyMultiCombobox
      field="genres"
      value={[]}
      onChange={onChange}
      label="Genres"
      {...props}
    />
  );
  return { onChange };
};

const openPopover = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('combobox'));
};

const newUser = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

describe('VocabularyMultiCombobox', () => {
  beforeEach(() => {
    mockResults = [
      { value: 'indie-rock', count: 7 },
      { value: 'post-punk', count: 3 },
    ];
    mockIsPending = false;
  });

  it('renders the label', () => {
    setup();

    expect(screen.getByText('Genres')).toBeInTheDocument();
  });

  it('renders a pill per value, display-formatted', () => {
    setup({ value: ['indie-rock'] });

    expect(screen.getByText('Indie Rock')).toBeInTheDocument();
  });

  it('applies the display override to a stored term', () => {
    setup({ value: ['r-and-b'] });

    expect(screen.getByText('R&B')).toBeInTheDocument();
  });

  it('adds a term picked from the dropdown', async () => {
    const user = newUser();
    const { onChange } = setup();

    await openPopover(user);
    await user.click(screen.getByText('Indie Rock'));

    expect(onChange).toHaveBeenCalledWith(['indie-rock']);
  });

  it('shows the usage count beside a suggestion', async () => {
    const user = newUser();
    setup();

    await openPopover(user);

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('adds free text as a normalised term', async () => {
    const user = newUser();
    const { onChange } = setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), 'Noise Rock');
    await user.click(screen.getByText('Add "Noise Rock"'));

    expect(onChange).toHaveBeenCalledWith(['noise-rock']);
  });

  it('does not offer to add a term that is already suggested', async () => {
    const user = newUser();
    setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), 'Indie Rock');

    expect(screen.queryByText('Add "Indie Rock"')).not.toBeInTheDocument();
  });

  it('ignores a term already on the pill list', async () => {
    const user = newUser();
    const { onChange } = setup({ value: ['indie-rock'] });

    await openPopover(user);
    await user.click(screen.getByRole('option', { name: /Indie Rock/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a term through its pill X', async () => {
    const user = newUser();
    const { onChange } = setup({ value: ['indie-rock', 'noise'] });

    await user.click(screen.getByRole('button', { name: 'Remove Indie Rock' }));

    expect(onChange).toHaveBeenCalledWith(['noise']);
  });

  it('mutes pills past highlightCount', () => {
    setup({ value: ['a-one', 'b-two', 'c-three', 'd-four'], highlightCount: 3 });

    expect(screen.getByTestId('pill-d-four')).toHaveClass('opacity-60');
  });

  it('does not mute pills within highlightCount', () => {
    setup({ value: ['a-one', 'b-two', 'c-three', 'd-four'], highlightCount: 3 });

    expect(screen.getByTestId('pill-c-three')).not.toHaveClass('opacity-60');
  });

  it('mutes nothing when highlightCount is absent', () => {
    setup({ value: ['a-one', 'b-two', 'c-three', 'd-four'] });

    expect(screen.getByTestId('pill-d-four')).not.toHaveClass('opacity-60');
  });

  it('explains the highlight cutoff in helper text', () => {
    setup({ value: ['a-one'], highlightCount: 3 });

    expect(screen.getByText(/first 3 appear on artist cards/i)).toBeInTheDocument();
  });

  it('shows caller-supplied helper text', () => {
    setup({ helperText: 'Admin-only filing terms.' });

    expect(screen.getByText('Admin-only filing terms.')).toBeInTheDocument();
  });

  it('disables the trigger when disabled', () => {
    setup({ disabled: true });

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('disables pill removal when disabled', () => {
    setup({ value: ['indie-rock'], disabled: true });

    expect(screen.getByRole('button', { name: 'Remove Indie Rock' })).toBeDisabled();
  });

  it('gives each pill a keyboard-reachable drag handle', () => {
    setup({ value: ['indie-rock'] });

    expect(screen.getByRole('button', { name: 'Reorder Indie Rock' })).toBeInTheDocument();
  });

  it('shows a loading state while suggestions are pending', async () => {
    mockIsPending = true;
    mockResults = [];
    const user = newUser();
    setup();

    await openPopover(user);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('labels the pill list for assistive technology', () => {
    setup({ value: ['indie-rock'] });

    expect(screen.getByRole('list', { name: /selected genres/i })).toBeInTheDocument();
  });

  it('adds the highlighted suggestion on Enter', async () => {
    const user = newUser();
    const { onChange } = setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), 'ind{Enter}');

    expect(onChange.mock.calls).toEqual([[['indie-rock']]]);
  });

  it('adds the typed term on Enter when nothing matches it', async () => {
    mockResults = [];
    const user = newUser();
    const { onChange } = setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), 'Noise Rock{Enter}');

    expect(onChange.mock.calls).toEqual([[['noise-rock']]]);
  });

  it('adds nothing on Enter when the query normalises to nothing', async () => {
    mockResults = [];
    const user = newUser();
    const { onChange } = setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), '!!!{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', async () => {
    const user = newUser();
    const { onChange } = setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), 'noise');

    expect(onChange).not.toHaveBeenCalled();
  });

  describe('reordering', () => {
    it('moves a pill to the drop position', () => {
      const { onChange } = setup({ value: ['a-one', 'b-two', 'c-three'] });

      dragEnd.current?.({ active: { id: 'c-three' }, over: { id: 'a-one' } });

      expect(onChange).toHaveBeenCalledWith(['c-three', 'a-one', 'b-two']);
    });

    it('does nothing when the pill is dropped on itself', () => {
      const { onChange } = setup({ value: ['a-one', 'b-two'] });

      dragEnd.current?.({ active: { id: 'a-one' }, over: { id: 'a-one' } });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does nothing when dropped outside any target', () => {
      const { onChange } = setup({ value: ['a-one', 'b-two'] });

      dragEnd.current?.({ active: { id: 'a-one' }, over: null });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does nothing when the dragged term is no longer in the list', () => {
      const { onChange } = setup({ value: ['a-one', 'b-two'] });

      dragEnd.current?.({ active: { id: 'gone' }, over: { id: 'a-one' } });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does nothing when the drop target is no longer in the list', () => {
      const { onChange } = setup({ value: ['a-one', 'b-two'] });

      dragEnd.current?.({ active: { id: 'a-one' }, over: { id: 'gone' } });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('clears the search when the popover closes', async () => {
    const user = newUser();
    setup();

    await openPopover(user);
    await user.type(screen.getByPlaceholderText(/search genres/i), 'noise');
    await user.keyboard('{Escape}');
    await openPopover(user);

    expect(screen.getByPlaceholderText(/search genres/i)).toHaveValue('');
  });
});
