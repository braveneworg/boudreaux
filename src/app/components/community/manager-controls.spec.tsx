/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { grantManagerAction, removeManagerAction } from '@/lib/actions/submission-actions';

import { ManagerControls } from './manager-controls';

const { mockToast, mockRouter } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@/lib/actions/submission-actions', () => ({
  grantManagerAction: vi.fn(),
  removeManagerAction: vi.fn(),
}));

const managers = [
  { id: 'a'.repeat(24), username: 'street_team' },
  { id: 'b'.repeat(24), username: 'merch_table' },
];

const ok = (username: string) => ({ success: true as const, data: { username } });

describe('ManagerControls', () => {
  it('lists each manager by username', () => {
    render(<ManagerControls managers={managers} />);

    const list = screen.getByRole('list', { name: 'Managers' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([expect.stringContaining('street_team'), expect.stringContaining('merch_table')]);
  });

  it('says so when there are no managers', () => {
    render(<ManagerControls managers={[]} />);

    expect(screen.getByText('No managers yet. Admins approve everything.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Managers' })).not.toBeInTheDocument();
  });

  it('makes the named user a manager, says so and reloads the list', async () => {
    vi.mocked(grantManagerAction).mockResolvedValueOnce(ok('new_helper'));
    render(<ManagerControls managers={managers} />);

    await userEvent.type(screen.getByLabelText('Username'), 'new_helper');
    await userEvent.click(screen.getByRole('button', { name: 'Make manager' }));

    expect(vi.mocked(grantManagerAction).mock.calls).toEqual([[{ username: 'new_helper' }]]);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
    expect(mockToast.success.mock.calls).toEqual([['new_helper is now a manager.']]);
    expect(screen.getByLabelText('Username')).toHaveValue('');
  });

  it('shows why a user could not be made a manager, under the field', async () => {
    vi.mocked(grantManagerAction).mockResolvedValueOnce({
      success: false,
      error: 'No user has that username.',
      code: 'NOT_FOUND',
      fieldErrors: { username: ['No user has that username.'] },
    });
    render(<ManagerControls managers={managers} />);

    await userEvent.type(screen.getByLabelText('Username'), 'ghost');
    await userEvent.click(screen.getByRole('button', { name: 'Make manager' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No user has that username.');
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Username')).toHaveValue('ghost');
  });

  it('sends nothing for an empty username', async () => {
    render(<ManagerControls managers={managers} />);

    await userEvent.click(screen.getByRole('button', { name: 'Make manager' }));

    expect(grantManagerAction).not.toHaveBeenCalled();
  });

  it('removes a manager, says so and reloads the list', async () => {
    vi.mocked(removeManagerAction).mockResolvedValueOnce(ok('merch_table'));
    render(<ManagerControls managers={managers} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove merch_table' }));

    expect(vi.mocked(removeManagerAction).mock.calls).toEqual([[{ username: 'merch_table' }]]);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
    expect(mockToast.success.mock.calls).toEqual([['merch_table is no longer a manager.']]);
  });

  it('says why a manager could not be removed', async () => {
    vi.mocked(removeManagerAction).mockResolvedValueOnce({
      success: false,
      error: 'That user is not a manager.',
      code: 'INVALID_INPUT',
      fieldErrors: { username: ['That user is not a manager.'] },
    });
    render(<ManagerControls managers={managers} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove street_team' }));

    await waitFor(() =>
      expect(mockToast.error.mock.calls).toEqual([['That user is not a manager.']])
    );
  });
});
