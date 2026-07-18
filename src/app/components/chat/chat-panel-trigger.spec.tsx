/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatPanelTrigger } from './chat-panel-trigger';
import { useChatOpen } from './use-chat-open';

const OpenProbe = () => {
  const { open } = useChatOpen();
  return <output data-testid="open-state">{open ? 'open' : 'closed'}</output>;
};

const renderDocked = () =>
  render(
    <>
      <ChatPanelTrigger />
      <OpenProbe />
    </>
  );

describe('ChatPanelTrigger', () => {
  it('docks the trigger sticky inside the panel flow with the CSS marker', () => {
    const { container } = renderDocked();

    const dock = container.querySelector('[data-chat-panel-trigger]');
    expect(dock).toHaveClass('sticky', 'bottom-6', 'justify-end', 'pointer-events-none');
  });

  it('un-fixes the stamp button and keeps it clickable', () => {
    renderDocked();

    const button = screen.getByRole('button', { name: 'Open chat' });
    expect(button).toHaveClass('static', 'pointer-events-auto');
    expect(button).not.toHaveClass('fixed');
  });

  it('opens the shared chat drawer state on click', async () => {
    const user = userEvent.setup();
    renderDocked();

    await user.click(screen.getByRole('button', { name: 'Open chat' }));

    expect(screen.getByTestId('open-state')).toHaveTextContent('open');
  });
});
