// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatReactionBar } from './chat-reaction-bar';

describe('ChatReactionBar', () => {
  it('renders nothing when the reactions array is empty', () => {
    const { container } = render(
      <ChatReactionBar reactions={[]} currentUserId="user-1" onToggle={() => undefined} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one pill per emoji with the vote count', () => {
    render(
      <ChatReactionBar
        reactions={[
          { emoji: '🔥', userIds: ['user-1', 'user-2'] },
          { emoji: '👍', userIds: ['user-3'] },
        ]}
        currentUserId="user-1"
        onToggle={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: /react with 🔥 \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /react with 👍 \(1\)/i })).toBeInTheDocument();
  });

  it('marks the current user’s pill with aria-pressed=true', () => {
    render(
      <ChatReactionBar
        reactions={[{ emoji: '🔥', userIds: ['user-1'] }]}
        currentUserId="user-1"
        onToggle={() => undefined}
      />
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks pills the current user has not reacted to with aria-pressed=false', () => {
    render(
      <ChatReactionBar
        reactions={[{ emoji: '🔥', userIds: ['user-2'] }]}
        currentUserId="user-1"
        onToggle={() => undefined}
      />
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('invokes onToggle with the emoji when a pill is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <ChatReactionBar
        reactions={[{ emoji: '🔥', userIds: ['user-2'] }]}
        currentUserId="user-1"
        onToggle={onToggle}
      />
    );

    await user.click(screen.getByRole('button', { name: /react with 🔥/i }));
    expect(onToggle).toHaveBeenCalledWith('🔥');
  });
});
