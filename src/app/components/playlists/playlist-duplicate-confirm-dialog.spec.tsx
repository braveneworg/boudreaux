/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PlaylistDuplicateConfirmDialog } from './playlist-duplicate-confirm-dialog';

type DialogProps = Parameters<typeof PlaylistDuplicateConfirmDialog>[0];

const renderDialog = (overrides: Partial<DialogProps> = {}) => {
  const props: DialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    itemTitle: 'Neon Dawn',
    onConfirm: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaylistDuplicateConfirmDialog {...props} />), props };
};

describe('PlaylistDuplicateConfirmDialog', () => {
  it('renders an alert dialog titled "Already in playlist"', () => {
    renderDialog();

    expect(screen.getByRole('alertdialog', { name: 'Already in playlist' })).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('describes the duplicate using the quoted item title', () => {
    renderDialog();

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      '"Neon Dawn" is already in this playlist. Add it again?'
    );
  });

  it('calls onConfirm and closes when "Add again" is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Add again' }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes without confirming when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
