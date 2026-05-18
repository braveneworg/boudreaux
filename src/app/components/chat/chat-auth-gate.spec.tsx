// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatAuthGate } from './chat-auth-gate';

const pathnameMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

beforeEach(() => pathnameMock.mockReset());

describe('ChatAuthGate', () => {
  it('renders a sign-in CTA with the current pathname as callbackUrl', () => {
    pathnameMock.mockReturnValue('/releases/some-album');

    render(<ChatAuthGate />);

    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute(
      'href',
      `/signin?callbackUrl=${encodeURIComponent('/releases/some-album')}`
    );
  });

  it('falls back to "/" when pathname is null', () => {
    pathnameMock.mockReturnValue(null);

    render(<ChatAuthGate />);

    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', `/signin?callbackUrl=${encodeURIComponent('/')}`);
  });

  it('shows the "Sign in to chat" copy', () => {
    pathnameMock.mockReturnValue('/');
    render(<ChatAuthGate />);
    expect(screen.getByText('Sign in to chat')).toBeInTheDocument();
  });

  it('invokes onSignIn when the CTA is clicked so the launcher can dismiss the drawer', async () => {
    pathnameMock.mockReturnValue('/');
    const onSignIn = vi.fn();

    render(<ChatAuthGate onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole('link', { name: /sign in/i }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
