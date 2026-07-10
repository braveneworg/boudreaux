/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoPublishDialog } from './video-publish-dialog';

describe('VideoPublishDialog', () => {
  it('labels the trigger "Publish" for the publish verb', () => {
    render(<VideoPublishDialog verb="publish" title="Live Set" onConfirm={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('labels the trigger "Unpublish" for the unpublish verb', () => {
    render(<VideoPublishDialog verb="unpublish" title="Live Set" onConfirm={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('shows the publish confirmation heading when opened', async () => {
    render(<VideoPublishDialog verb="publish" title="Live Set" onConfirm={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(screen.getByRole('heading', { name: 'Confirm Publish' })).toBeInTheDocument();
  });

  it('shows the unpublish confirmation heading when opened', async () => {
    render(<VideoPublishDialog verb="unpublish" title="Live Set" onConfirm={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    expect(screen.getByRole('heading', { name: 'Confirm Unpublish' })).toBeInTheDocument();
  });

  it('invokes onConfirm when the publish is confirmed', async () => {
    const onConfirm = vi.fn();
    render(<VideoPublishDialog verb="publish" title="Live Set" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onConfirm when the unpublish is confirmed', async () => {
    const onConfirm = vi.fn();
    render(<VideoPublishDialog verb="unpublish" title="Live Set" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
