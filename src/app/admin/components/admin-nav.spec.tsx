/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AdminNav } from './admin-nav';
import { ADMIN_NAV_ITEMS } from './admin-nav-items';

/** Force the nav's scroll container to report a given overflow geometry. */
const setOverflow = (
  list: HTMLElement,
  {
    scrollLeft,
    clientWidth,
    scrollWidth,
  }: { scrollLeft: number; clientWidth: number; scrollWidth: number }
): void => {
  Object.defineProperty(list, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
  Object.defineProperty(list, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(list, 'scrollWidth', { configurable: true, value: scrollWidth });
};

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

  it('hides both scroll arrows when the menu is not overflowing', () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    expect(
      screen.queryByRole('button', { name: /scroll admin sections/i })
    ).not.toBeInTheDocument();
  });

  it('shows the right arrow and scrolls right when there is more to reveal', async () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    const list = screen.getByRole('list');
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;
    setOverflow(list, { scrollLeft: 0, clientWidth: 300, scrollWidth: 1000 });
    fireEvent.scroll(list);

    const rightArrow = screen.getByRole('button', { name: 'Scroll admin sections right' });
    expect(
      screen.queryByRole('button', { name: 'Scroll admin sections left' })
    ).not.toBeInTheDocument();

    await userEvent.click(rightArrow);

    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 200 }));
  });

  it('shows the left arrow and scrolls left once scrolled away from the start', async () => {
    mockPathname = '/admin';
    render(<AdminNav />);

    const list = screen.getByRole('list');
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;
    setOverflow(list, { scrollLeft: 400, clientWidth: 300, scrollWidth: 1000 });
    fireEvent.scroll(list);

    const leftArrow = screen.getByRole('button', { name: 'Scroll admin sections left' });

    await userEvent.click(leftArrow);

    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: -200 }));
  });
});
