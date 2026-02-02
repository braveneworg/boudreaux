import { render, screen } from '@testing-library/react';

import Footer from './footer';

describe('Footer', () => {
  it('renders the footer element', () => {
    render(<Footer />);

    expect(document.querySelector('footer')).toBeInTheDocument();
  });

  it('displays copyright text with current year', () => {
    render(<Footer />);

    expect(screen.getByText(/© 2025 Fake Four Inc\./)).toBeInTheDocument();
  });

  it('displays all rights reserved text', () => {
    render(<Footer />);

    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
  });

  it('renders Terms and Conditions link', () => {
    render(<Footer />);

    const termsLink = screen.getByRole('link', { name: /terms and conditions/i });
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute('href', '/legal/terms-and-conditions');
  });

  it('renders Privacy Policy link', () => {
    render(<Footer />);

    const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', '/legal/privacy-policy');
  });

  it('renders Cookies Policy link', () => {
    render(<Footer />);

    const cookiesLink = screen.getByRole('link', { name: /cookies policy/i });
    expect(cookiesLink).toBeInTheDocument();
    expect(cookiesLink).toHaveAttribute('href', '/legal/cookies-policy');
  });

  it('renders navigation element', () => {
    render(<Footer />);

    expect(document.querySelector('nav')).toBeInTheDocument();
  });

  it('renders vertical separators', () => {
    render(<Footer />);

    // There should be separators between links and in the copyright section
    const separators = document.querySelectorAll('[data-slot="separator"]');
    expect(separators.length).toBeGreaterThan(0);
  });
});
