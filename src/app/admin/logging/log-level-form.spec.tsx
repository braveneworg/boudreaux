/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { setLogLevelAction } from '@/lib/actions/set-log-level-action';

import { LogLevelForm } from './log-level-form';

vi.mock('@/lib/actions/set-log-level-action', () => ({
  setLogLevelAction: vi.fn(),
}));

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const noOverrideState = {
  configuredLevel: 'info' as const,
  override: null,
  effectiveLevel: 'info' as const,
  expiresAt: null,
};

const debugOverrideState = {
  configuredLevel: 'info' as const,
  override: 'debug' as const,
  effectiveLevel: 'debug' as const,
  expiresAt: '2026-06-10T12:00:00.000Z',
};

describe('LogLevelForm', () => {
  it('shows the configured default and no-override status', () => {
    render(<LogLevelForm initialState={noOverrideState} />);

    expect(screen.getByText(/configured default/i)).toBeInTheDocument();
    expect(screen.getByText(/no override active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset to default/i })).toBeDisabled();
  });

  it('applies the selected level with the chosen duration', async () => {
    const user = userEvent.setup();
    vi.mocked(setLogLevelAction).mockResolvedValue({ success: true, state: debugOverrideState });
    render(<LogLevelForm initialState={noOverrideState} />);

    await user.click(screen.getByRole('radio', { name: 'debug' }));
    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect(setLogLevelAction).toHaveBeenCalledWith({ level: 'debug', ttlMinutes: 60 });
    expect(await screen.findByText(/log level set to "debug"/i)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it('clears the override via the reset button', async () => {
    const user = userEvent.setup();
    vi.mocked(setLogLevelAction).mockResolvedValue({ success: true, state: noOverrideState });
    render(<LogLevelForm initialState={debugOverrideState} />);

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    expect(setLogLevelAction).toHaveBeenCalledWith({ level: null });
    expect(await screen.findByText(/override cleared/i)).toBeInTheDocument();
  });

  it('shows an error message when the action fails', async () => {
    const user = userEvent.setup();
    vi.mocked(setLogLevelAction).mockResolvedValue({ success: false, error: 'unauthorized' });
    render(<LogLevelForm initialState={noOverrideState} />);

    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('shows a generic error when the action throws', async () => {
    const user = userEvent.setup();
    vi.mocked(setLogLevelAction).mockRejectedValue(new Error('network'));
    render(<LogLevelForm initialState={noOverrideState} />);

    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect(await screen.findByText(/unexpected error/i)).toBeInTheDocument();
  });
});
