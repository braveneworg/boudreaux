/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DesktopAuthMenu } from './desktop-auth-menu';

const mockUseSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: (options?: { redirect?: boolean; callbackUrl?: string }) => mockSignOut(options),
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

    it('signs out with redirect disabled on click', async () => {
      mockSignOut.mockResolvedValue({ url: '/' });
      render(<DesktopAuthMenu />);
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      await vi.waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ redirect: false, callbackUrl: '/' });
      });
    });

    it('navigates to the returned URL after signing out', async () => {
      mockSignOut.mockResolvedValue({ url: '/signed-out' });
      render(<DesktopAuthMenu />);
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      await vi.waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/signed-out');
      });
    });
  });
});
