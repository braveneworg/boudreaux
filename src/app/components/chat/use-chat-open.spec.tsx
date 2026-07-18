/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useChatOpen } from './use-chat-open';

const Probe = () => {
  const { open, setOpen } = useChatOpen();
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {open ? 'open' : 'closed'}
    </button>
  );
};

describe('useChatOpen', () => {
  it('starts closed and toggles through the shared setter', async () => {
    const user = userEvent.setup();
    render(<Probe />);

    expect(screen.getByRole('button')).toHaveTextContent('closed');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('open');
  });

  it('shares one state across sibling consumers with no provider', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Probe />
        <Probe />
      </>
    );

    const [first, second] = screen.getAllByRole('button');
    await user.click(first);
    expect(second).toHaveTextContent('open');
  });

  it('resets to closed between tests via the store-reset infra', () => {
    expect(useChatOpen.getState().open).toBe(false);
    useChatOpen.getState().setOpen(true);
    expect(useChatOpen.getState().open).toBe(true);
  });
});
