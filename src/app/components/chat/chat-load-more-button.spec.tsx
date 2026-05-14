// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatLoadMoreButton } from './chat-load-more-button';

describe('ChatLoadMoreButton', () => {
  it('renders an accessible "Load more" button when idle', () => {
    render(<ChatLoadMoreButton onLoadMore={() => undefined} isLoading={false} />);
    const button = screen.getByRole('button', { name: /load older messages/i });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Load more');
  });

  it('shows a spinner and disables itself while loading', () => {
    render(<ChatLoadMoreButton onLoadMore={() => undefined} isLoading />);
    const button = screen.getByRole('button', { name: /load older messages/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/loading/i);
  });

  it('fires onLoadMore exactly once per click', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();

    render(<ChatLoadMoreButton onLoadMore={onLoadMore} isLoading={false} />);
    await user.click(screen.getByRole('button', { name: /load older messages/i }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
