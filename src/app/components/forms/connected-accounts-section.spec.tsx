/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConnectedAccountsSection } from './connected-accounts-section';

const useConnectedAccountsMock = vi.hoisted(() => vi.fn());
const linkSocialMock = vi.hoisted(() => vi.fn());
const unlinkAccountMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const reportClientErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-connected-accounts', () => ({
  useConnectedAccounts: () => useConnectedAccountsMock(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    linkSocial: linkSocialMock,
    unlinkAccount: unlinkAccountMock,
  },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/utils/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
}));

const makeAccount = (providerId: string) => ({
  id: `id-${providerId}`,
  providerId,
  accountId: `acct-${providerId}`,
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  scopes: [] as string[],
});

const defaultHookResult = {
  accounts: null,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

describe('ConnectedAccountsSection', () => {
  beforeEach(() => {
    useConnectedAccountsMock.mockReset();
    linkSocialMock.mockReset();
    unlinkAccountMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    reportClientErrorMock.mockReset();
    useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult });
  });

  describe('loading state', () => {
    it('shows 4 skeleton rows while loading', () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, isLoading: true });

      const { container } = render(<ConnectedAccountsSection />);

      const skeletons = container.querySelectorAll('[data-slot="skeleton"], .animate-pulse');
      expect(skeletons.length).toBeGreaterThanOrEqual(4);
    });

    it('does not show provider names while loading', () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, isLoading: true });

      render(<ConnectedAccountsSection />);

      expect(screen.queryByText('Apple')).not.toBeInTheDocument();
      expect(screen.queryByText('Google')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows an error alert when the hook returns an error', () => {
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        error: new Error('Could not load accounts'),
      });

      render(<ConnectedAccountsSection />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Could not load accounts/i)).toBeInTheDocument();
    });
  });

  describe('provider list', () => {
    it('renders all 4 provider names when accounts are loaded', () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, accounts: [] });

      render(<ConnectedAccountsSection />);

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Google')).toBeInTheDocument();
      expect(screen.getByText('Facebook')).toBeInTheDocument();
      expect(screen.getByText('X (Twitter)')).toBeInTheDocument();
    });

    it('shows "Connected" badge for a linked provider', () => {
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('google')],
      });

      render(<ConnectedAccountsSection />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows "Not connected" text for an unlinked provider', () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, accounts: [] });

      render(<ConnectedAccountsSection />);

      const notConnectedElements = screen.getAllByText('Not connected');
      expect(notConnectedElements.length).toBe(4);
    });

    it('shows "Unlink" button for a linked provider', () => {
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('google')],
      });

      render(<ConnectedAccountsSection />);

      expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
    });

    it('shows "Link" buttons for unlinked providers', () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, accounts: [] });

      render(<ConnectedAccountsSection />);

      const linkButtons = screen.getAllByRole('button', { name: 'Link' });
      expect(linkButtons.length).toBe(4);
    });
  });

  describe('link action', () => {
    it('calls authClient.linkSocial with correct args when Link button is clicked', async () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, accounts: [] });
      linkSocialMock.mockResolvedValue({ data: null, error: null });

      render(<ConnectedAccountsSection />);

      const linkButtons = screen.getAllByRole('button', { name: 'Link' });
      await userEvent.click(linkButtons[0]); // Apple is first

      expect(linkSocialMock).toHaveBeenCalledWith({
        provider: 'apple',
        callbackURL: '/profile',
      });
    });
  });

  describe('unlink action', () => {
    it('opens an AlertDialog when Unlink is clicked', async () => {
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('google')],
      });

      render(<ConnectedAccountsSection />);

      await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText(/Disconnect Google\?/i)).toBeInTheDocument();
    });

    it('calls authClient.unlinkAccount on confirm and shows success toast', async () => {
      const refetchMock = vi.fn().mockResolvedValue(undefined);
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('google')],
        refetch: refetchMock,
      });
      unlinkAccountMock.mockResolvedValue({ data: {}, error: null });

      render(<ConnectedAccountsSection />);

      await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
      await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

      await waitFor(() => {
        expect(unlinkAccountMock).toHaveBeenCalledWith({ providerId: 'google' });
        expect(toastMock.success).toHaveBeenCalledWith('Disconnected from Google');
        expect(refetchMock).toHaveBeenCalled();
      });
    });

    it('shows error toast and calls reportClientError on unlink failure', async () => {
      const refetchMock = vi.fn();
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('google')],
        refetch: refetchMock,
      });
      const unlinkError = new Error('Unlink failed');
      unlinkAccountMock.mockResolvedValue({ data: null, error: unlinkError });

      render(<ConnectedAccountsSection />);

      await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
      await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Failed to disconnect from Google');
        expect(reportClientErrorMock).toHaveBeenCalledWith(unlinkError, 'route');
      });
      expect(refetchMock).not.toHaveBeenCalled();
    });

    it('shows error toast when unlinkAccount throws', async () => {
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('facebook')],
        refetch: vi.fn(),
      });
      unlinkAccountMock.mockRejectedValue(new Error('Network failure'));

      render(<ConnectedAccountsSection />);

      await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
      await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Failed to disconnect from Facebook');
        expect(reportClientErrorMock).toHaveBeenCalled();
      });
    });

    it('cancelling the AlertDialog does not call unlinkAccount', async () => {
      useConnectedAccountsMock.mockReturnValue({
        ...defaultHookResult,
        accounts: [makeAccount('apple')],
        refetch: vi.fn(),
      });

      render(<ConnectedAccountsSection />);

      await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(unlinkAccountMock).not.toHaveBeenCalled();
    });
  });

  describe('section headings', () => {
    it('renders the section label and heading', () => {
      useConnectedAccountsMock.mockReturnValue({ ...defaultHookResult, accounts: [] });

      render(<ConnectedAccountsSection />);

      expect(screen.getByText(/Connected accounts/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Social accounts/i })).toBeInTheDocument();
    });
  });
});
