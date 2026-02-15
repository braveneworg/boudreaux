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

describe('ChangeEmailSuccessContainer', () => {
  const testEmail = 'newemail@example.com';

  it('renders success heading', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByRole('heading', { name: /Success! 🎉/i })).toBeInTheDocument();
  });

  it('renders email change success message', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(
      screen.getByText(/You have successfully changed your email address/i)
    ).toBeInTheDocument();
  });

  it('indicates user was signed out', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByText(/You have also been signed out/i)).toBeInTheDocument();
  });

  it('displays the new email address', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByText(testEmail)).toBeInTheDocument();
  });

  it('renders link to signin page', () => {
    render(<SuccessContainer email={testEmail} />);
    const link = screen.getByTestId('next-link');
    expect(link).toHaveAttribute('href', '/signin');
    expect(link).toHaveTextContent('Sign in again');
  });
});
