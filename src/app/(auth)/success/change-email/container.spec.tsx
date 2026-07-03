/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { SuccessContainer } from './container';

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

  it('renders success heading as an image', () => {
    render(<SuccessContainer email={testEmail} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    const headingImage = screen.getByRole('img', { name: /success/i });
    expect(headingImage).toHaveAttribute('alt', 'success');
  });

  it('renders a kraft zine panel', () => {
    const { container } = render(<SuccessContainer email={testEmail} />);
    const panel = container.querySelector('section[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-kraft');
  });

  it('renders the success heading inside the panel', () => {
    const { container } = render(<SuccessContainer email={testEmail} />);
    const panel = container.querySelector('section[data-slot="zine-panel"]');
    expect(panel).toContainElement(screen.getByRole('img', { name: /success/i }));
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
