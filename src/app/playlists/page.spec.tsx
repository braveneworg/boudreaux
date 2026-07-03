/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import PlaylistsPage from './page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('PlaylistsPage', () => {
  it('renders the content on a teal zine panel', () => {
    const { container } = render(<PlaylistsPage />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-teal');
  });

  it('renders the cutout strip heading with the page name', () => {
    render(<PlaylistsPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    const strip = heading.querySelector('[data-slot="zine-heading"]');
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent('Playlists');
  });

  it('renders the coming-soon copy', () => {
    render(<PlaylistsPage />);

    expect(
      screen.getByText('Curated playlists from the Fake Four family are coming soon.')
    ).toBeInTheDocument();
  });

  it('links to the releases page', () => {
    render(<PlaylistsPage />);

    expect(screen.getByRole('link', { name: 'Browse Releases' })).toHaveAttribute(
      'href',
      '/releases'
    );
  });

  it('renders the breadcrumb with the page name', () => {
    render(<PlaylistsPage />);

    expect(screen.getByRole('link', { name: 'Playlists', current: 'page' })).toBeInTheDocument();
  });
});
