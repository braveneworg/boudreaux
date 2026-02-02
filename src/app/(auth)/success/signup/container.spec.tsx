import React from 'react';

import { render, screen } from '@testing-library/react';

import SuccessContainer from './container';

// Mock UI components
vi.mock('@/app/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
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

  it('renders success heading', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByRole('heading', { name: /Success! 🎉/i })).toBeInTheDocument();
  });

  it('renders PageContainer component', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('renders ContentContainer component', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('renders Card component', () => {
    render(<SuccessContainer email={testEmail} />);
    expect(screen.getByTestId('card')).toBeInTheDocument();
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
