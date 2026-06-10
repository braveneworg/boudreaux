// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatTriggerButton } from './chat-trigger-button';

describe('ChatTriggerButton', () => {
  it('renders with an accessible label and the "Chat" caption', () => {
    render(<ChatTriggerButton onOpen={() => undefined} />);

    expect(screen.getByRole('button', { name: /open chat/i })).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('invokes onOpen when clicked', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatTriggerButton onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: /open chat/i }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('forwards an additional className to the root button', () => {
    render(<ChatTriggerButton onOpen={() => undefined} className="custom-extra" />);
    expect(screen.getByRole('button', { name: /open chat/i })).toHaveClass('custom-extra');
  });
});
