// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ChatTypingIndicator } from './chat-typing-indicator';

describe('ChatTypingIndicator', () => {
  it('renders nothing when there are no typers', () => {
    const { container } = render(<ChatTypingIndicator typers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "X is typing…" for a single typer', () => {
    render(<ChatTypingIndicator typers={[{ userId: 'user-2', username: 'cat' }]} />);
    expect(screen.getByText('cat is typing…')).toBeInTheDocument();
  });

  it('renders "X and Y are typing…" for exactly two typers', () => {
    render(
      <ChatTypingIndicator
        typers={[
          { userId: 'user-2', username: 'cat' },
          { userId: 'user-3', username: 'dog' },
        ]}
      />
    );
    expect(screen.getByText('cat and dog are typing…')).toBeInTheDocument();
  });

  it('renders "X and N others are typing…" for three or more typers', () => {
    render(
      <ChatTypingIndicator
        typers={[
          { userId: 'u2', username: 'cat' },
          { userId: 'u3', username: 'dog' },
          { userId: 'u4', username: 'fox' },
        ]}
      />
    );
    expect(screen.getByText('cat and 2 others are typing…')).toBeInTheDocument();
  });

  it('falls back to "someone" when a typer has no username', () => {
    render(<ChatTypingIndicator typers={[{ userId: 'user-2', username: null }]} />);
    expect(screen.getByText('someone is typing…')).toBeInTheDocument();
  });
});
