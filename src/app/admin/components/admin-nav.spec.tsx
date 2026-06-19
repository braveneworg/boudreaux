/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import { AdminNav } from './admin-nav';
import { ADMIN_NAV_ITEMS } from './admin-nav-items';

let mockPathname = '/admin';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('AdminNav', () => {
  it('renders a link for every admin section', () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    ADMIN_NAV_ITEMS.forEach((item) => {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    });
  });

  it('renders the links in importance order, releases first', () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);

    expect(labels).toEqual(ADMIN_NAV_ITEMS.map((item) => item.label));
    expect(labels[0]).toBe('Releases');
  });

  it('is labelled as the admin sections navigation', () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    expect(screen.getByRole('navigation', { name: /admin sections/i })).toBeInTheDocument();
  });

  it('marks the active top-level section with aria-current', () => {
    mockPathname = '/admin/releases';
    render(<AdminNav />);

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Artists' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the section active on its subpages', () => {
    mockPathname = '/admin/tours/123/edit';
    render(<AdminNav />);

    expect(screen.getByRole('link', { name: 'Tours' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark a section active from a prefix-only match', () => {
    mockPathname = '/admin/release-notes';
    render(<AdminNav />);

    expect(screen.getByRole('link', { name: 'Releases' })).not.toHaveAttribute('aria-current');
  });

  it('renders the links in the cutout display font', () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    const nav = screen.getByRole('navigation', { name: /admin sections/i });
    within(nav)
      .getAllByRole('link')
      .forEach((link) => expect(link).toHaveClass('font-fake-four-cutout'));
  });
});
