/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import Footer from './footer';

describe('Footer', () => {
  it('renders the footer element', () => {
    render(<Footer />);

    expect(document.querySelector('footer')).toBeInTheDocument();
  });

  describe('copyright', () => {
    it('displays copyright text with current year and all rights reserved', () => {
      render(<Footer />);

      const currentYear = new Date().getFullYear();
      expect(screen.getByText(new RegExp(`© ${currentYear} Fake Four Inc\\.`))).toBeInTheDocument();
      expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
    });

    it('copyright section has correct text color', () => {
      const { container } = render(<Footer />);

      const copyrightText = container.querySelector('.text-zinc-50.text-sm');
      expect(copyrightText).toBeInTheDocument();
    });
  });

  describe('legal links', () => {
    it('renders exactly three legal links', () => {
      render(<Footer />);

      expect(screen.getAllByRole('link')).toHaveLength(3);
    });

    it.each([
      { name: /terms and conditions/i, href: '/legal/terms-and-conditions' },
      { name: /privacy policy/i, href: '/legal/privacy-policy' },
      { name: /cookies policy/i, href: '/legal/cookies-policy' },
    ])('renders $name link to $href', ({ name, href }) => {
      render(<Footer />);

      const link = screen.getByRole('link', { name });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', href);
    });

    it('legal links have text styling and hover underline', () => {
      render(<Footer />);

      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        expect(link).toHaveClass('text-zinc-50', 'text-sm', 'hover:underline');
      });
    });
  });

  describe('layout and styling', () => {
    it('footer has background, full width, and relative positioning', () => {
      render(<Footer />);

      const footer = document.querySelector('footer');
      expect(footer).toHaveClass('bg-zinc-950', 'w-full', 'relative');
    });

    it('renders content container with max width', () => {
      render(<Footer />);

      const container = document.querySelector('footer > div');
      expect(container).toHaveClass('max-w-[1920px]');
    });

    it('renders navigation with flex-wrap for responsive layout', () => {
      render(<Footer />);

      const nav = document.querySelector('nav');
      expect(nav).toHaveClass('flex', 'flex-wrap', 'items-center', 'justify-center');
    });

    it('renders vertical separators', () => {
      render(<Footer />);

      const separators = document.querySelectorAll('[data-slot="separator"]');
      expect(separators.length).toBeGreaterThan(0);
    });
  });
});
