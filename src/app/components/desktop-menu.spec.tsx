/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { DesktopMenu } from './desktop-menu';

const mockUseSession = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('DesktopMenu', () => {
  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'unauthenticated' });
    });

    it('renders the public menu items', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
      expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute('href', '/releases');
      expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos');
      expect(screen.getByRole('link', { name: 'Tours' })).toHaveAttribute('href', '/tours');
      expect(screen.getByRole('link', { name: 'Merch' })).toHaveAttribute('href', '/merch');
      expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists');
      expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
      expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/contact');
    });

    it('renders nine menu items when logged out', () => {
      render(<DesktopMenu />);

      expect(screen.getAllByRole('listitem')).toHaveLength(9);
    });

    it('does not render the My Collection link', () => {
      render(<DesktopMenu />);

      expect(screen.queryByRole('link', { name: 'My Collection' })).not.toBeInTheDocument();
    });

    it('keeps each link its own color in the visited state', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveClass(
        'visited:text-menu-item-yellow-400'
      );
    });
  });

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'authenticated' });
    });

    it('renders the My Collection link', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'My Collection' })).toHaveAttribute(
        'href',
        '/collection'
      );
    });

    it('renders ten menu items when logged in', () => {
      render(<DesktopMenu />);

      expect(screen.getAllByRole('listitem')).toHaveLength(10);
    });

    it('inserts My Collection after Releases', () => {
      render(<DesktopMenu />);

      const labels = screen.getAllByRole('link').map((link) => link.textContent);
      expect(labels).toEqual([
        'Home',
        'Artists',
        'Releases',
        'My Collection',
        'Videos',
        'Tours',
        'Merch',
        'Playlists',
        'About',
        'Contact Us',
      ]);
    });
  });
});
