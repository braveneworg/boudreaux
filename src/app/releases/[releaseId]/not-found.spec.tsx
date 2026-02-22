/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import NotFoundPage from './not-found';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-testid="not-found-link">
      {children}
    </a>
  ),
}));

describe('NotFoundPage', () => {
  it('should render "Release not found" message', () => {
    render(<NotFoundPage />);

    expect(screen.getByText(/release not found/i)).toBeInTheDocument();
  });

  it('should render a link back to /releases', () => {
    render(<NotFoundPage />);

    const link = screen.getByTestId('not-found-link');
    expect(link).toHaveAttribute('href', '/releases');
  });

  it('should render a descriptive message', () => {
    render(<NotFoundPage />);

    expect(screen.getByText(/could not find the requested release/i)).toBeInTheDocument();
  });
});
