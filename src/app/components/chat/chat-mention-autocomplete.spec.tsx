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
