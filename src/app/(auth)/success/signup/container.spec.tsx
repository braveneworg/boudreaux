/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { SuccessContainer } from './container';

vi.mock('next/navigation', () => ({
  usePathname: () => '/signin',
}));

// Mock UI components
vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: Array<{ anchorText: string }> }) => (
    <nav data-testid="breadcrumb-menu">{items[0]?.anchorText}</nav>
  ),
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/page-section-paragraph', () => ({
  PageSectionParagraph: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="page-section-paragraph">{children}</p>
  ),
}));

describe('SignupSuccessContainer', () => {
  const testEmail = 'test@example.com';

  it('renders success heading as an image', () => {
    render(<SuccessContainer email={testEmail} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    const headingImage = screen.getByRole('img', { name: /success/i });
    expect(headingImage).toHaveAttribute('alt', 'success');
  });

  it('renders PageContainer component', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('renders ContentContainer component', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('renders breadcrumb menu with sign-in context', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
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

  it('renders check email instruction', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByText(/Check your email/i)).toBeInTheDocument();
  });

  it('renders link was sent message', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByText(/A link was sent to/i)).toBeInTheDocument();
  });

  it('displays the email address', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByText(testEmail)).toBeInTheDocument();
  });

  it('renders email as a mailto link', () => {
    render(<SuccessContainer email={testEmail} />);
    const mailtoLink = screen.getByRole('link', { name: testEmail });
    expect(mailtoLink).toHaveAttribute('href', `mailto:${testEmail}`);
  });

  it('renders to sign in instruction', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByText(/to sign in/i)).toBeInTheDocument();
  });
});
