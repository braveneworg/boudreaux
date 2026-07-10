/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoFormFooter } from './video-form-footer';

describe('VideoFormFooter', () => {
  it('labels the submit button "Save" when idle', () => {
    render(<VideoFormFooter isSubmitting={false} isUploading={false} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('labels the submit button "Saving…" while submitting', () => {
    render(<VideoFormFooter isSubmitting isUploading={false} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });

  it('disables the submit button while an upload is in flight', () => {
    render(<VideoFormFooter isSubmitting={false} isUploading onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('invokes onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<VideoFormFooter isSubmitting={false} isUploading={false} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
