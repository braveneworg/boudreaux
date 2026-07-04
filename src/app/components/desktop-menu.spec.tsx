/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DesktopMenu } from './desktop-menu';

const mockUseSession = vi.fn();
const mockUsePathname = vi.fn();

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
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
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
  });

  describe('unauthenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'unauthenticated' });
    });

    it('renders Home and Contact Us as always-visible links', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/contact');
    });

    it('renders Music and Label as drawer triggers, not links', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('button', { name: /music/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /label/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Releases' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Tours' })).not.toBeInTheDocument();
    });

    it('reveals the Music drawer links on trigger click', async () => {
      const user = userEvent.setup();
      render(<DesktopMenu />);

      await user.click(screen.getByRole('button', { name: /music/i }));

      expect(await screen.findByRole('link', { name: 'Releases' })).toHaveAttribute(
        'href',
        '/releases'
      );
      expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
      expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists');
      expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos');
    });

    it('reveals the Label drawer links on trigger click', async () => {
      const user = userEvent.setup();
      render(<DesktopMenu />);

      await user.click(screen.getByRole('button', { name: /label/i }));

      expect(await screen.findByRole('link', { name: 'Tours' })).toHaveAttribute('href', '/tours');
      expect(screen.getByRole('link', { name: 'Merch' })).toHaveAttribute('href', '/merch');
      expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    });

    it('does not render My Collection anywhere', () => {
      render(<DesktopMenu />);

      expect(screen.queryByRole('link', { name: 'My Collection' })).not.toBeInTheDocument();
    });

    it('marks Home with aria-current on the root route', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    });

    it('applies the dynamic-on-hover prefetch boost to top-level links', () => {
      render(<DesktopMenu />);

      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
        'data-dynamic-on-hover',
        'true'
      );
    });
  });

  describe('authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({ status: 'authenticated' });
    });

    it('renders My Collection top-level between Label and Contact Us', async () => {
      render(<DesktopMenu />);

      // `useNavMenuItems` mount-gates auth, so wait for the post-mount render.
      expect(await screen.findByRole('link', { name: 'My Collection' })).toHaveAttribute(
        'href',
        '/collection'
      );

      const topLevel = screen
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '')
        .filter((text) => text.length > 0);
      const collectionIndex = topLevel.findIndex((t) => t.includes('My Collection'));
      const labelIndex = topLevel.findIndex((t) => t.includes('Label'));
      const contactIndex = topLevel.findIndex((t) => t.includes('Contact Us'));

      expect(collectionIndex).toBeGreaterThan(labelIndex);
      expect(collectionIndex).toBeLessThan(contactIndex);
    });
  });
});
