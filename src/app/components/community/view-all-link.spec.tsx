/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ViewAllLink } from './view-all-link';

const scrollIntoView = vi.fn();

const prefersReducedMotion = (reduced: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

const renderWithTarget = (): HTMLElement => {
  render(
    <>
      <ViewAllLink />
      <h2 id="all-submissions" tabIndex={-1}>
        All submissions
      </h2>
    </>
  );
  const target = screen.getByRole('heading', { name: 'All submissions' });
  target.scrollIntoView = scrollIntoView;
  return target;
};

afterEach(() => vi.unstubAllGlobals());

describe('ViewAllLink', () => {
  it('is a real link to the full list, so it works before the page hydrates', () => {
    render(<ViewAllLink />);

    expect(screen.getByRole('link', { name: 'View all user submitted content' })).toHaveAttribute(
      'href',
      '#all-submissions'
    );
  });

  it('scrolls smoothly to the full list', async () => {
    prefersReducedMotion(false);
    renderWithTarget();

    await userEvent.setup({ delay: null }).click(screen.getByRole('link'));

    expect(scrollIntoView.mock.calls).toEqual([[{ behavior: 'smooth', block: 'start' }]]);
  });

  it('jumps there, without animating, for a visitor who prefers reduced motion', async () => {
    prefersReducedMotion(true);
    renderWithTarget();

    await userEvent.setup({ delay: null }).click(screen.getByRole('link'));

    expect(scrollIntoView.mock.calls).toEqual([[{ behavior: 'auto', block: 'start' }]]);
  });

  it('moves keyboard focus to the list’s heading', async () => {
    prefersReducedMotion(false);
    const target = renderWithTarget();

    await userEvent.setup({ delay: null }).click(screen.getByRole('link'));

    expect(target).toHaveFocus();
  });
});
