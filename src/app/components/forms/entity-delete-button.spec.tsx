/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { EntityDeleteButton } from './entity-delete-button';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn() }));

const baseProps = {
  label: 'Delete Artist',
  title: 'Delete this artist?',
  description: 'This archives the artist.',
  successMessage: 'Artist deleted successfully',
  failureMessage: 'Failed to delete artist',
  redirectTo: '/admin/artists',
};

const setup = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EntityDeleteButton', () => {
  it('renders the destructive trigger with the given label', () => {
    render(<EntityDeleteButton {...baseProps} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Delete Artist' })).toBeInTheDocument();
  });

  it('opens a confirmation dialog before deleting', async () => {
    const onDelete = vi.fn(() => Promise.resolve({ success: true }));
    render(<EntityDeleteButton {...baseProps} onDelete={onDelete} />);

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this artist?')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes, toasts success, and navigates on confirm', async () => {
    const onDelete = vi.fn(() => Promise.resolve({ success: true }));
    render(<EntityDeleteButton {...baseProps} onDelete={onDelete} />);

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Artist deleted successfully');
    expect(mockPush).toHaveBeenCalledWith('/admin/artists');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not delete when the dialog is cancelled', async () => {
    const onDelete = vi.fn(() => Promise.resolve({ success: true }));
    render(<EntityDeleteButton {...baseProps} onDelete={onDelete} />);

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('toasts the action error and stays put on a failed delete', async () => {
    const onDelete = vi.fn(() => Promise.resolve({ success: false, error: 'Artist not found' }));
    render(<EntityDeleteButton {...baseProps} onDelete={onDelete} />);

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Artist not found'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to the failure message when the action gives no error', async () => {
    const onDelete = vi.fn(() => Promise.resolve({ success: false }));
    render(<EntityDeleteButton {...baseProps} onDelete={onDelete} />);

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to delete artist')
    );
  });

  it('shows a generic error toast when the delete throws', async () => {
    const onDelete = vi.fn(() => Promise.reject(new Error('boom')));
    render(<EntityDeleteButton {...baseProps} onDelete={onDelete} />);

    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('An unexpected error occurred')
    );
  });

  it('disables the trigger when disabled', () => {
    render(<EntityDeleteButton {...baseProps} onDelete={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Delete Artist' })).toBeDisabled();
  });
});
