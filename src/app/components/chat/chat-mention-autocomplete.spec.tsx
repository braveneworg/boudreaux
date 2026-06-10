/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';

import { ChatMentionAutocomplete } from './chat-mention-autocomplete';

const mockMentionQuery = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-mention-search-query', () => ({
  useMentionSearchQuery: (query: string, enabled: boolean) => mockMentionQuery(query, enabled),
}));

const baseProps = {
  activeIndex: 0,
  onActiveIndexChange: vi.fn(),
  onSelect: vi.fn(),
  onMatchesChange: vi.fn(),
};

describe('ChatMentionAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMentionQuery.mockReturnValue({ data: [], isFetching: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there are no matches and no fetch in flight', () => {
    const { container } = render(<ChatMentionAutocomplete {...baseProps} query="oc" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the searching indicator while a fetch is in flight without matches', () => {
    mockMentionQuery.mockReturnValue({ data: undefined, isFetching: true });

    render(<ChatMentionAutocomplete {...baseProps} query="oc" />);

    expect(screen.getByRole('listbox', { name: /mention suggestions/i })).toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('notifies the parent when the match list changes', () => {
    const onMatchesChange = vi.fn();
    const matches = [{ id: 'u1', username: 'octo' }];
    mockMentionQuery.mockReturnValue({ data: matches, isFetching: false });

    render(<ChatMentionAutocomplete {...baseProps} onMatchesChange={onMatchesChange} query="oc" />);

    expect(onMatchesChange).toHaveBeenCalledWith(matches);
  });

  it('selects a match on mousedown without default focus loss', () => {
    const onSelect = vi.fn();
    const match = { id: 'u1', username: 'octo' };
    mockMentionQuery.mockReturnValue({ data: [match], isFetching: false });

    render(<ChatMentionAutocomplete {...baseProps} onSelect={onSelect} query="oc" />);
    const option = screen.getByRole('option', { name: '@octo' });
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      option.dispatchEvent(mouseDown);
    });

    expect(onSelect).toHaveBeenCalledWith(match);
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it('moves the active index on mouse enter and marks the active option selected', () => {
    const onActiveIndexChange = vi.fn();
    mockMentionQuery.mockReturnValue({
      data: [
        { id: 'u1', username: 'octo' },
        { id: 'u2', username: 'octavia' },
      ],
      isFetching: false,
    });

    render(
      <ChatMentionAutocomplete
        {...baseProps}
        activeIndex={0}
        onActiveIndexChange={onActiveIndexChange}
        query="oc"
      />
    );

    expect(screen.getByRole('option', { name: '@octo' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: '@octavia' })).toHaveAttribute(
      'aria-selected',
      'false'
    );

    const mouseEnter = new MouseEvent('mouseover', { bubbles: true });
    act(() => {
      screen.getByRole('option', { name: '@octavia' }).dispatchEvent(mouseEnter);
    });

    expect(onActiveIndexChange).toHaveBeenCalledWith(1);
  });

  it('renders matches as listbox options', () => {
    mockMentionQuery.mockReturnValue({
      data: [{ id: 'u1', username: 'octo' }],
      isFetching: false,
    });

    render(<ChatMentionAutocomplete {...baseProps} query="oc" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByRole('option', { name: '@octo' })).toBeInTheDocument();
  });

  it('debounces the query before passing it to the search hook', () => {
    const { rerender } = render(<ChatMentionAutocomplete {...baseProps} query="o" />);

    rerender(<ChatMentionAutocomplete {...baseProps} query="oc" />);
    rerender(<ChatMentionAutocomplete {...baseProps} query="oct" />);

    expect(mockMentionQuery).toHaveBeenLastCalledWith('o', true);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(mockMentionQuery).toHaveBeenLastCalledWith('oct', true);
  });

  it('does not search the intermediate prefixes after the debounce settles', () => {
    const { rerender } = render(<ChatMentionAutocomplete {...baseProps} query="o" />);

    rerender(<ChatMentionAutocomplete {...baseProps} query="oc" />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<ChatMentionAutocomplete {...baseProps} query="oct" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const queriedPrefixes = mockMentionQuery.mock.calls.map(([query]) => query as string);
    expect(queriedPrefixes).not.toContain('oc');
  });
});
