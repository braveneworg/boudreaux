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

describe('ChangeUsernameSuccessContainer', () => {
  it('renders success heading', () => {
    render(<SuccessContainer />);
    expect(screen.getByRole('heading', { name: /Success! 🎉/i })).toBeInTheDocument();
  });

  it('renders username change success message', () => {
    render(<SuccessContainer />);
    expect(screen.getByText(/Your username has been successfully changed/i)).toBeInTheDocument();
  });

  it('renders link to profile page', () => {
    render(<SuccessContainer />);
    const links = screen.getAllByTestId('next-link');
    const profileLink = links.find((link) => link.getAttribute('href') === '/profile');
    expect(profileLink).toBeInTheDocument();
    expect(profileLink).toHaveTextContent('Return to your profile');
  });

  it('renders link to home page', () => {
    render(<SuccessContainer />);
    const links = screen.getAllByTestId('next-link');
    const homeLink = links.find((link) => link.getAttribute('href') === '/');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveTextContent('the home view');
  });
});
