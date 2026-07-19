/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { DesktopAuthMenu } from './desktop-auth-menu';

const mockUseSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/hooks/use-session', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('@/lib/auth-client', () => ({
  signOut: () => mockSignOut(),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/link to render a plain anchor (mirrors desktop-menu.spec.tsx)
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('DesktopAuthMenu', () => {
  describe('loading', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    });

    it('renders nothing while the session resolves', () => {
      const { container } = render(<DesktopAuthMenu />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  // Regression: better-auth resolves the session from an async fetch that can
  // land before React hydrates this node. The server can only ever render the
  // pending branch (null), so the first client render must also be null —
  // otherwise the resolved <nav> diverges from the server HTML and trips a
  // hydration mismatch. renderToString never runs effects, so it stands in for
  // the server / first-paint render here.
  describe('hydration safety', () => {
    it('renders nothing on the server even when the session has already resolved', () => {
      mockUseSession.mockReturnValue({
        data: { user: { username: 'bob', email: 'bob@example.com', role: 'user' } },
        status: 'authenticated',
      });
      expect(renderToString(<DesktopAuthMenu />)).toBe('');
    });

    it('renders nothing on the server for a resolved unauthenticated session', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      expect(renderToString(<DesktopAuthMenu />)).toBe('');
    });

    it('hydrates without a mismatch when the session resolves before hydration', async () => {
      // Server emits the pending branch (null) — all it can ever know.
      mockUseSession.mockReturnValue({ data: null, status: 'loading' });
      const container = document.createElement('div');
      container.innerHTML = renderToString(<DesktopAuthMenu />);

      // ...but the async session has already resolved by the time the client
      // hydrates this node (the production race that caused the mismatch).
      mockUseSession.mockReturnValue({
        data: { user: { username: 'bob', email: 'bob@example.com', role: 'user' } },
        status: 'authenticated',
      });

      const recoverableErrors: string[] = [];
      const root = await act(async () =>
        hydrateRoot(container, <DesktopAuthMenu />, {
          onRecoverableError: (error) => recoverableErrors.push(String(error)),
        })
      );

      expect(recoverableErrors).toEqual([]);
      act(() => root.unmount());
    });
  });

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    });

    it('links "sign in" to the signin route', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/signin');
    });

    it('links "sign up" to the signup route', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'sign up' })).toHaveAttribute('href', '/signup');
    });

    it('does not render a sign out control', () => {
      render(<DesktopAuthMenu />);
      expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    });

    it('keeps links white in the visited state', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'sign in' })).toHaveClass('visited:text-zinc-50');
    });

    it('applies the configured font and text classes', () => {
      const { container } = render(<DesktopAuthMenu />);
      expect(container.querySelector('nav')).toHaveClass(
        'font-fake-four-cutout',
        'text-lg',
        'text-zinc-50'
      );
    });

    it('pins itself to the upper-right of the header', () => {
      const { container } = render(<DesktopAuthMenu />);
      expect(container.querySelector('nav')).toHaveClass('absolute', 'top-6', 'right-10', 'z-30');
    });

    it('falls back to signed-out links when status is authenticated but session is missing', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'authenticated' });
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'sign in' })).toBeInTheDocument();
    });
  });

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: { user: { username: 'bob', email: 'bob@example.com', role: 'user' } },
        status: 'authenticated',
      });
    });

    it('renders a sign out control', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });

    it('pins itself to the upper-right of the header', () => {
      const { container } = render(<DesktopAuthMenu />);
      expect(container.querySelector('nav')).toHaveClass('absolute', 'top-6', 'right-10', 'z-30');
    });

    it('links the username to the profile page', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: '@bob' })).toHaveAttribute('href', '/profile');
    });

    it('renders the username in bold', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: '@bob' })).toHaveClass('font-bold');
    });

    it('keeps the username link white in the visited state', () => {
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: '@bob' })).toHaveClass('visited:text-zinc-50');
    });

    it('falls back to the name when no username is set', () => {
      mockUseSession.mockReturnValue({
        data: { user: { email: 'bob@example.com', name: 'Bob Smith', role: 'user' } },
        status: 'authenticated',
      });
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'Bob Smith' })).toHaveAttribute('href', '/profile');
    });

    it('falls back to the email when no username or name is set', () => {
      mockUseSession.mockReturnValue({
        data: { user: { email: 'bob@example.com', role: 'user' } },
        status: 'authenticated',
      });
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'bob@example.com' })).toBeInTheDocument();
    });

    it('does not render an admin link for non-admins', () => {
      render(<DesktopAuthMenu />);
      expect(screen.queryByRole('link', { name: 'admin' })).not.toBeInTheDocument();
    });

    it('renders an admin link for admins', () => {
      mockUseSession.mockReturnValue({
        data: { user: { username: 'boss', email: 'boss@example.com', role: 'admin' } },
        status: 'authenticated',
      });
      render(<DesktopAuthMenu />);
      expect(screen.getByRole('link', { name: 'admin' })).toHaveAttribute('href', '/admin');
    });

    it('signs out on click', async () => {
      mockSignOut.mockResolvedValue(undefined);
      render(<DesktopAuthMenu />);
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      await vi.waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
      });
    });

    it('navigates home after signing out', async () => {
      mockSignOut.mockResolvedValue(undefined);
      render(<DesktopAuthMenu />);
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      await vi.waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });
});
