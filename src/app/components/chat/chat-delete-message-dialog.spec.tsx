// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatDeleteMessageDialog } from './chat-delete-message-dialog';

const renderDialog = (overrides: Partial<Parameters<typeof ChatDeleteMessageDialog>[0]> = {}) => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(
    <ChatDeleteMessageDialog
      open
      onOpenChange={onOpenChange}
      authorUsername="octo"
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onOpenChange, onConfirm, ...utils };
};

describe('ChatDeleteMessageDialog', () => {
  it('renders both destructive options and the cancel button', () => {
    renderDialog();
    expect(screen.getByRole('alertdialog', { name: /delete message/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete this message/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete all by octo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  });

  it('falls back to a generic label when the author username is missing', () => {
    renderDialog({ authorUsername: null });
    expect(screen.getByRole('button', { name: /delete all by this user/i })).toBeInTheDocument();
    expect(screen.getByText(/every message by this user/i)).toBeInTheDocument();
  });

  it('invokes onConfirm("message") when the per-message button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: /delete this message/i }));

    expect(onConfirm).toHaveBeenCalledWith('message');
  });

  it('invokes onConfirm("user") when the per-user button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: /delete all by octo/i }));

    expect(onConfirm).toHaveBeenCalledWith('user');
  });

  it('closes via onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
