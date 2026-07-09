/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoArchiveDialog } from './video-archive-dialog';

describe('VideoArchiveDialog', () => {
  it('labels the trigger "Archive" for the archive verb', () => {
    render(<VideoArchiveDialog verb="archive" title="Live Set" onConfirm={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('labels the trigger "Restore" for the restore verb', () => {
    render(<VideoArchiveDialog verb="restore" title="Live Set" onConfirm={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('labels the trigger "Delete" for the delete verb', () => {
    render(<VideoArchiveDialog verb="delete" title="Live Set" onConfirm={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('shows the archive confirmation heading when opened', async () => {
    render(<VideoArchiveDialog verb="archive" title="Live Set" onConfirm={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(screen.getByRole('heading', { name: 'Confirm Archive' })).toBeInTheDocument();
  });

  it('warns that deleting permanently removes the video and its files from storage', async () => {
    render(<VideoArchiveDialog verb="delete" title="Live Set" onConfirm={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      screen.getByText(/permanently removes the video and its files from storage/i)
    ).toBeInTheDocument();
  });

  it('invokes onConfirm when the archive is confirmed', async () => {
    const onConfirm = vi.fn();
    render(<VideoArchiveDialog verb="archive" title="Live Set" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onConfirm when the restore is confirmed', async () => {
    const onConfirm = vi.fn();
    render(<VideoArchiveDialog verb="restore" title="Live Set" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onConfirm when the delete is confirmed', async () => {
    const onConfirm = vi.fn();
    render(<VideoArchiveDialog verb="delete" title="Live Set" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
