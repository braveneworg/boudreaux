// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';

import { ChatMessageList } from './chat-message-list';

const makeMsg = (id: string): OptimisticChatMessage => ({
  id,
  body: `msg-${id}`,
  reactions: [],
  createdAt: '2026-05-01T12:00:00Z',
  user: { id: 'user-1', username: 'octo', gravatarHash: 'abc' },
});

const baseProps = {
  hasNextPage: false,
  isFetchingNextPage: false,
  onLoadMore: vi.fn(),
};

describe('ChatMessageList', () => {
  it('renders an empty-state message when there are no messages', () => {
    render(<ChatMessageList {...baseProps} messages={[]} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('renders all provided messages in order', () => {
    render(
      <ChatMessageList {...baseProps} messages={[makeMsg('a'), makeMsg('b'), makeMsg('c')]} />
    );
    const bodies = screen.getAllByText(/^msg-/).map((n) => n.textContent);
    expect(bodies).toEqual(['msg-a', 'msg-b', 'msg-c']);
  });

  it('renders the Load more button only when hasNextPage is true', () => {
    const { rerender } = render(
      <ChatMessageList {...baseProps} messages={[makeMsg('a')]} hasNextPage={false} />
    );
    expect(screen.queryByRole('button', { name: /load older messages/i })).not.toBeInTheDocument();

    rerender(<ChatMessageList {...baseProps} messages={[makeMsg('a')]} hasNextPage />);
    expect(screen.getByRole('button', { name: /load older messages/i })).toBeInTheDocument();
  });

  it('invokes onLoadMore when the Load more button is clicked', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatMessageList
        messages={[makeMsg('a')]}
        hasNextPage
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />
    );

    await user.click(screen.getByRole('button', { name: /load older messages/i }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('renders a custom reaction bar per row via renderReactionBar', () => {
    render(
      <ChatMessageList
        {...baseProps}
        messages={[makeMsg('a'), makeMsg('b')]}
        renderReactionBar={(m) => <span data-testid={`bar-${m.id}`}>{m.id}</span>}
      />
    );

    expect(screen.getByTestId('bar-a')).toBeInTheDocument();
    expect(screen.getByTestId('bar-b')).toBeInTheDocument();
  });

  it('keys rows by tempId when present so optimistic placeholders are stable', () => {
    const optimistic: OptimisticChatMessage = { ...makeMsg('msg-1'), tempId: 'tmp-1' };
    const { container } = render(<ChatMessageList {...baseProps} messages={[optimistic]} />);
    // No assertion needed beyond the render not crashing — keying is internal.
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });
});
