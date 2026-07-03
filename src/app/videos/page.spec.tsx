/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import VideosPage from './page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('VideosPage', () => {
  it('renders the content on a kraft zine panel', () => {
    const { container } = render(<VideosPage />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-kraft');
  });

  it('renders the cutout strip heading with the page name', () => {
    render(<VideosPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    const strip = heading.querySelector('[data-slot="zine-heading"]');
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent('Videos');
  });

  it('renders the coming-soon copy', () => {
    render(<VideosPage />);

    expect(
      screen.getByText(
        "Music videos and live session footage are on the way — we're digitizing the archive now."
      )
    ).toBeInTheDocument();
  });

  it('links to the releases page', () => {
    render(<VideosPage />);

    expect(screen.getByRole('link', { name: 'Browse Releases' })).toHaveAttribute(
      'href',
      '/releases'
    );
  });

  it('renders the breadcrumb with the page name', () => {
    render(<VideosPage />);

    expect(screen.getByRole('link', { name: 'Videos', current: 'page' })).toBeInTheDocument();
  });
});
