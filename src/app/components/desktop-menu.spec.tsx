/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { DesktopMenu } from './desktop-menu';

const mockUseSession = vi.fn();

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => mockUseSession(),
}));

// Mock next/link to render a plain anchor, surfacing the prefetch posture as
// data attributes (they are Link behavior, not DOM attributes, so the real
// component would hide them from assertions).
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    unstable_dynamicOnHover,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
    unstable_dynamicOnHover?: boolean;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch === undefined ? 'default' : String(prefetch)}
      data-dynamic-on-hover={String(unstable_dynamicOnHover === true)}
      {...props}
    >
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

    it('colors each link underline on hover to match its own hue', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveClass(
        'hover:decoration-menu-item-yellow-400'
      );
    });

    it('fades the text and underline color in and out on hover', () => {
      render(<DesktopMenu />);

      const home = screen.getByRole('link', { name: 'Home' });
      expect(home).toHaveClass('transition-colors');
      expect(home).toHaveClass('duration-200');
    });

    it('keeps default viewport prefetching on every nav link', () => {
      render(<DesktopMenu />);

      screen.getAllByRole('link').forEach((link) => {
        expect(link).toHaveAttribute('data-prefetch', 'default');
      });
    });

    it('upgrades every nav link to a full prefetch on hover', () => {
      render(<DesktopMenu />);

      screen.getAllByRole('link').forEach((link) => {
        expect(link).toHaveAttribute('data-dynamic-on-hover', 'true');
      });
    });

    it('renders links white by default with color scoped to interactive states', () => {
      render(<DesktopMenu />);

      const home = screen.getByRole('link', { name: 'Home' });
      expect(home).toHaveClass('text-zinc-50');
      expect(home).toHaveClass('hover:text-menu-item-yellow-400');
      expect(home).toHaveClass('aria-[current=page]:text-menu-item-yellow-400');
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
