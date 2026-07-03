/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import MerchPage from './page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('MerchPage', () => {
  it('renders the content on a mustard zine panel', () => {
    const { container } = render(<MerchPage />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-mustard');
  });

  it('renders the cutout strip heading with the page name', () => {
    render(<MerchPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    const strip = heading.querySelector('[data-slot="zine-heading"]');
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent('Merch');
  });

  it('renders the coming-soon copy', () => {
    render(<MerchPage />);

    expect(
      screen.getByText(
        'The merch table is being set up. Shirts, tapes, and prints are coming soon.'
      )
    ).toBeInTheDocument();
  });

  it('links to the releases page', () => {
    render(<MerchPage />);

    expect(screen.getByRole('link', { name: 'Browse Releases' })).toHaveAttribute(
      'href',
      '/releases'
    );
  });

  it('renders the breadcrumb with the page name', () => {
    render(<MerchPage />);

    expect(screen.getByRole('link', { name: 'Merch', current: 'page' })).toBeInTheDocument();
  });
});
