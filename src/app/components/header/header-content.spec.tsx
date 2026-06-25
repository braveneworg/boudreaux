/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { HeaderContent } from './header-content';

// Mock next/image using <span> to avoid @next/next/no-img-element lint rule
vi.mock('next/image', () => ({
  default: function MockImage(props: {
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
    priority?: boolean;
  }) {
    return (
      <span
        className={props.className}
        data-alt={props.alt}
        data-height={props.height}
        data-priority={props.priority ? 'true' : 'false'}
        data-src={props.src}
        data-testid="next-image"
        data-width={props.width}
      />
    );
  },
}));

// Mock Logo component
vi.mock('./logo', () => ({
  Logo: ({ isMobile, priority }: { isMobile?: boolean; priority?: boolean }) => (
    <div data-is-mobile={isMobile} data-priority={priority} data-testid="logo">
      Logo
    </div>
  ),
}));

// Mock HamburgerMenu component
vi.mock('../ui/hamburger-menu', () => ({
  HamburgerMenu: () => <div data-testid="hamburger-menu">HamburgerMenu</div>,
}));

// Mock DesktopMenu component (it depends on the client session hook)
vi.mock('../desktop-menu', () => ({
  DesktopMenu: () => <div data-testid="desktop-menu">DesktopMenu</div>,
}));

// Mock DesktopAuthMenu component (it depends on the client session hook)
vi.mock('../desktop-auth-menu', () => ({
  DesktopAuthMenu: () => <div data-testid="desktop-auth-menu">DesktopAuthMenu</div>,
}));

describe('HeaderContent', () => {
  // The header renders both the mobile and desktop chrome and toggles them
  // purely with CSS (`contents` ↔ `hidden`) at the `xl` breakpoint, so the
  // layout is correct regardless of the server's User-Agent guess.
  describe('responsive chrome', () => {
    it('renders the mobile logo (isMobile=true)', () => {
      render(<HeaderContent />);
      const mobileLogo = screen
        .getAllByTestId('logo')
        .find((logo) => logo.getAttribute('data-is-mobile') === 'true');
      expect(mobileLogo).toBeInTheDocument();
    });

    it('renders the desktop logo (isMobile=false)', () => {
      render(<HeaderContent />);
      const desktopLogo = screen
        .getAllByTestId('logo')
        .find((logo) => logo.getAttribute('data-is-mobile') === 'false');
      expect(desktopLogo).toBeInTheDocument();
    });

    it('lazy-loads the desktop logo so its image is not fetched on phones', () => {
      render(<HeaderContent />);
      const desktopLogo = screen
        .getAllByTestId('logo')
        .find((logo) => logo.getAttribute('data-is-mobile') === 'false');
      expect(desktopLogo).toHaveAttribute('data-priority', 'false');
    });

    it('lazy-loads the mobile logo so its image is not fetched on desktop', () => {
      render(<HeaderContent />);
      const mobileLogo = screen
        .getAllByTestId('logo')
        .find((logo) => logo.getAttribute('data-is-mobile') === 'true');
      expect(mobileLogo).toHaveAttribute('data-priority', 'false');
    });

    it('lazy-loads both wordmark images so only the active viewport fetches one', () => {
      render(<HeaderContent />);
      const wordmarks = screen.getAllByTestId('next-image');
      expect(wordmarks.every((image) => image.getAttribute('data-priority') === 'false')).toBe(
        true
      );
    });

    it('renders the hamburger menu', () => {
      render(<HeaderContent />);
      expect(screen.getByTestId('hamburger-menu')).toBeInTheDocument();
    });

    it('hides the mobile chrome at xl via the wrapper', () => {
      render(<HeaderContent />);
      const mobileWrapper = screen.getByTestId('hamburger-menu').parentElement;
      expect(mobileWrapper).toHaveClass('contents', 'xl:hidden');
    });

    it('renders the DesktopMenu', () => {
      render(<HeaderContent />);
      expect(screen.getByTestId('desktop-menu')).toBeInTheDocument();
    });

    it('renders the DesktopAuthMenu', () => {
      render(<HeaderContent />);
      expect(screen.getByTestId('desktop-auth-menu')).toBeInTheDocument();
    });

    it('hides the desktop chrome below xl via the wrapper', () => {
      render(<HeaderContent />);
      const desktopWrapper = screen.getByTestId('desktop-menu').parentElement;
      expect(desktopWrapper).toHaveClass('hidden', 'xl:contents');
    });

    it('renders the mobile words image at the smaller width', () => {
      render(<HeaderContent />);
      const mobileWords = screen
        .getAllByTestId('next-image')
        .find((image) => image.getAttribute('data-width') === '222');
      expect(mobileWords).toBeInTheDocument();
    });

    it('renders the desktop words image at the larger width', () => {
      render(<HeaderContent />);
      const desktopWords = screen
        .getAllByTestId('next-image')
        .find((image) => image.getAttribute('data-width') === '444');
      expect(desktopWords).toBeInTheDocument();
    });

    it('uses the Fake Four Inc. words asset for the header images', () => {
      render(<HeaderContent />);
      const images = screen.getAllByTestId('next-image');
      expect(
        images.every(
          (image) => image.getAttribute('data-src') === '/media/fake-four-inc-words-sans-hand.webp'
        )
      ).toBe(true);
    });
  });

  describe('header content', () => {
    it('renders header element with flex layout', () => {
      const { container } = render(<HeaderContent />);
      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('items-center');
      expect(header).toHaveClass('justify-between');
    });

    it('aligns content to the start at xl', () => {
      const { container } = render(<HeaderContent />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('xl:justify-start');
    });

    it('applies the compact base height', () => {
      const { container } = render(<HeaderContent />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('h-14.5');
    });

    it('grows to the tablet height at md to meet the hamburger sheet', () => {
      const { container } = render(<HeaderContent />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('md:h-30.5');
    });

    it('grows to the desktop height at xl', () => {
      const { container } = render(<HeaderContent />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('xl:h-56');
    });

    it('renders content layer with proper z-index', () => {
      const { container } = render(<HeaderContent />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toBeInTheDocument();
    });

    it('content layer has max-width constraint', () => {
      const { container } = render(<HeaderContent />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toHaveClass('xl:max-w-480');
    });

    it('content layer has overflow hidden', () => {
      const { container } = render(<HeaderContent />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toHaveClass('overflow-hidden');
    });
  });
});
