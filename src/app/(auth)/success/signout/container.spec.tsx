/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import SuccessContainer from './container';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a data-testid="next-link" href={href}>
      {children}
    </a>
  ),
}));

describe('SignoutSuccessContainer', () => {
  it('renders success heading', () => {
    render(<SuccessContainer />);
    expect(screen.getByRole('heading', { name: /Success! 🎉/i })).toBeInTheDocument();
  });

  it('renders signout success message', () => {
    render(<SuccessContainer />);
    expect(screen.getByText(/You have been successfully signed out/i)).toBeInTheDocument();
  });

  it('includes browser privacy reminder', () => {
    render(<SuccessContainer />);
    expect(
      screen.getByText(/Please close your browser to protect your privacy/i)
    ).toBeInTheDocument();
  });

  it('renders link to signin page', () => {
    render(<SuccessContainer />);
    const link = screen.getByTestId('next-link');
    expect(link).toHaveAttribute('href', '/signin');
    expect(link).toHaveTextContent('Return to signin');
  });
});
