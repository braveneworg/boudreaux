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

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./chat-body', () => ({
  ChatBody: () => <div data-testid="chat-body-mock">ChatBody</div>,
}));

beforeEach(() => {
  useSessionMock.mockReset();
  useIsMobileMock.mockReturnValue(false);
  usePathnameMock.mockReturnValue('/');
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
    const user = userEvent.setup();

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
    const user = userEvent.setup();

    render(<ChatLauncher />);
    await user.click(screen.getByRole('button', { name: /open chat/i }));

    // ChatBody is mocked at the top of this file so the launcher test
    // does not pull in the realtime + query dependency graph.
    expect(screen.getByTestId('chat-body-mock')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to chat')).not.toBeInTheDocument();
  });

  // Close-button behaviour is covered by chat-drawer.spec.tsx. We do
  // not re-test the controlled close transition here because Vaul's
  // pointer-event close path reads `style.transform`, which jsdom
  // doesn't populate, and the alternative synthetic-click path does
  // not reliably propagate onOpenChange through the Vaul state machine.
});
