// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatLauncher } from './chat-launcher';

const useSessionMock = vi.hoisted(() => vi.fn());
const useIsMobileMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const searchParamsMock = vi.hoisted(() => vi.fn());
const disconnectPusherClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => useSessionMock(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('@/lib/utils/pusher-client', () => ({
  disconnectPusherClient: disconnectPusherClientMock,
}));

vi.mock('./chat-body', () => ({
  ChatBody: () => <div data-testid="chat-body-mock">ChatBody</div>,
}));

const authenticatedSession = {
  status: 'authenticated',
  data: { user: { id: 'user-1', email: 'octo@example.com', name: 'Octo' } },
};

beforeEach(() => {
  useSessionMock.mockReset();
  disconnectPusherClientMock.mockReset();
  useIsMobileMock.mockReturnValue(false);
  usePathnameMock.mockReturnValue('/');
  searchParamsMock.mockReturnValue(new URLSearchParams());
});

describe('ChatLauncher', () => {
  it('renders the trigger but no drawer content on first render', () => {
    useSessionMock.mockReturnValue({ status: 'unauthenticated', data: null });

    render(<ChatLauncher />);

    expect(screen.getByRole('button', { name: /open chat/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /live chat/i })).not.toBeInTheDocument();
  });

  it('opens the drawer and shows the auth gate for unauthenticated users', async () => {
    useSessionMock.mockReturnValue({ status: 'unauthenticated', data: null });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatLauncher />);
    await user.click(screen.getByRole('button', { name: /open chat/i }));

    expect(screen.getByRole('img', { name: /live chat/i })).toHaveAttribute('alt', 'live chat');
    expect(screen.getByText('Sign in to chat')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-body-placeholder')).not.toBeInTheDocument();
  });

  it('opens the drawer and mounts the ChatBody for authenticated users', async () => {
    useSessionMock.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: 'user-1', email: 'octo@example.com', name: 'Octo' } },
    });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatLauncher />);
    await user.click(screen.getByRole('button', { name: /open chat/i }));

    // ChatBody is mocked at the top of this file so the launcher test
    // does not pull in the realtime + query dependency graph.
    expect(screen.getByTestId('chat-body-mock')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to chat')).not.toBeInTheDocument();
  });

  it('auto-opens the drawer for an authenticated viewer arriving via a mention link', () => {
    useSessionMock.mockReturnValue(authenticatedSession);
    searchParamsMock.mockReturnValue(new URLSearchParams('chat=mention'));

    const { rerender } = render(<ChatLauncher />);

    // The auto-open effect mounts ChatBody without any click.
    expect(screen.getByTestId('chat-body-mock')).toBeInTheDocument();

    // Flip auth off then on so the auto-open effect re-runs with
    // `autoOpenedRef.current` already true, exercising the early-return
    // branch instead of force-opening the drawer a second time.
    useSessionMock.mockReturnValue({ status: 'unauthenticated', data: null });
    rerender(<ChatLauncher />);
    useSessionMock.mockReturnValue(authenticatedSession);
    rerender(<ChatLauncher />);

    // The sign-out transition tore down the socket exactly once.
    expect(disconnectPusherClientMock).toHaveBeenCalledTimes(1);
  });

  it('does not auto-open for an anonymous viewer arriving via a mention link', () => {
    useSessionMock.mockReturnValue({ status: 'unauthenticated', data: null });
    searchParamsMock.mockReturnValue(new URLSearchParams('chat=mention'));

    render(<ChatLauncher />);

    expect(screen.queryByText('Sign in to chat')).not.toBeInTheDocument();
  });

  it('tears down the Pusher socket and closes the drawer on sign-out', async () => {
    useSessionMock.mockReturnValue(authenticatedSession);
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    const { rerender } = render(<ChatLauncher />);
    await user.click(screen.getByRole('button', { name: /open chat/i }));
    expect(screen.getByTestId('chat-body-mock')).toBeInTheDocument();

    // Transition from authenticated → unauthenticated triggers the teardown.
    useSessionMock.mockReturnValue({ status: 'unauthenticated', data: null });
    rerender(<ChatLauncher />);

    expect(disconnectPusherClientMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('chat-body-mock')).not.toBeInTheDocument();
  });

  // Close-button behaviour is covered by chat-drawer.spec.tsx. We do
  // not re-test the controlled close transition here because Vaul's
  // pointer-event close path reads `style.transform`, which jsdom
  // doesn't populate, and the alternative synthetic-click path does
  // not reliably propagate onOpenChange through the Vaul state machine.
});
