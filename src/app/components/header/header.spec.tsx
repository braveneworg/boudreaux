/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { Header } from './header';

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
  Logo: ({ isMobile }: { isMobile?: boolean }) => (
    <div data-is-mobile={isMobile} data-testid="logo">
      Logo
    </div>
  ),
}));

// Mock HamburgerMenu component
vi.mock('../ui/hamburger-menu', () => ({
  HamburgerMenu: () => <div data-testid="hamburger-menu">HamburgerMenu</div>,
}));

// Mock DesktopMenu component (it depends on next-auth's useSession)
vi.mock('../desktop-menu', () => ({
  DesktopMenu: () => <div data-testid="desktop-menu">DesktopMenu</div>,
}));

// Mock DesktopAuthMenu component (it depends on next-auth's useSession)
vi.mock('../desktop-auth-menu', () => ({
  DesktopAuthMenu: () => <div data-testid="desktop-auth-menu">DesktopAuthMenu</div>,
}));

describe('Header', () => {
  it('renders without crashing', () => {
    render(<Header />);
    expect(screen.getAllByTestId('logo').length).toBeGreaterThan(0);
  });

  it('renders with sticky positioning', () => {
    const { container } = render(<Header />);
    const headerWrapper = container.firstChild as HTMLElement;
    expect(headerWrapper).toHaveClass('sticky');
    expect(headerWrapper).toHaveClass('top-0');
    expect(headerWrapper).toHaveClass('z-40');
  });

  it('renders full-width wrapper', () => {
    const { container } = render(<Header />);
    const headerWrapper = container.firstChild as HTMLElement;
    expect(headerWrapper).toHaveClass('w-full');
    expect(headerWrapper).toHaveClass('left-0');
    expect(headerWrapper).toHaveClass('right-0');
  });

  it('applies the className passed in', () => {
    const { container } = render(<Header className="custom-class" />);
    const headerWrapper = container.firstChild as HTMLElement;
    expect(headerWrapper).toHaveClass('custom-class');
  });

  // The header renders both the mobile and desktop chrome and toggles them
  // purely with CSS (`contents` ↔ `hidden`) at the `xl` breakpoint, so the
  // layout is correct regardless of the server's User-Agent guess.
  describe('responsive chrome', () => {
    it('renders the mobile logo (isMobile=true)', () => {
      render(<Header />);
      const mobileLogo = screen
        .getAllByTestId('logo')
        .find((logo) => logo.getAttribute('data-is-mobile') === 'true');
      expect(mobileLogo).toBeInTheDocument();
    });

    it('renders the desktop logo (isMobile=false)', () => {
      render(<Header />);
      const desktopLogo = screen
        .getAllByTestId('logo')
        .find((logo) => logo.getAttribute('data-is-mobile') === 'false');
      expect(desktopLogo).toBeInTheDocument();
    });

    it('renders the hamburger menu', () => {
      render(<Header />);
      expect(screen.getByTestId('hamburger-menu')).toBeInTheDocument();
    });

    it('hides the mobile chrome at xl via the wrapper', () => {
      render(<Header />);
      const mobileWrapper = screen.getByTestId('hamburger-menu').parentElement;
      expect(mobileWrapper).toHaveClass('contents', 'xl:hidden');
    });

    it('renders the DesktopMenu', () => {
      render(<Header />);
      expect(screen.getByTestId('desktop-menu')).toBeInTheDocument();
    });

    it('renders the DesktopAuthMenu', () => {
      render(<Header />);
      expect(screen.getByTestId('desktop-auth-menu')).toBeInTheDocument();
    });

    it('hides the desktop chrome below xl via the wrapper', () => {
      render(<Header />);
      const desktopWrapper = screen.getByTestId('desktop-menu').parentElement;
      expect(desktopWrapper).toHaveClass('hidden', 'xl:contents');
    });

    it('renders the mobile words image at the smaller width', () => {
      render(<Header />);
      const mobileWords = screen
        .getAllByTestId('next-image')
        .find((image) => image.getAttribute('data-width') === '222');
      expect(mobileWords).toBeInTheDocument();
    });

    it('renders the desktop words image at the larger width', () => {
      render(<Header />);
      const desktopWords = screen
        .getAllByTestId('next-image')
        .find((image) => image.getAttribute('data-width') === '444');
      expect(desktopWords).toBeInTheDocument();
    });

    it('uses the Fake Four Inc. words asset for the header images', () => {
      render(<Header />);
      const images = screen.getAllByTestId('next-image');
      expect(
        images.every(
          (image) => image.getAttribute('data-src') === '/media/fake-four-inc-words-sans-hand.webp'
        )
      ).toBe(true);
    });
  });

  describe('animated background', () => {
    it('renders background div with CSS animation class', () => {
      const { container } = render(<Header />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      expect(bgDiv).toBeInTheDocument();
    });

    it('paints the dark particle backdrop below xl', () => {
      const { container } = render(<Header />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      expect(bgDiv).toHaveClass('absolute', 'inset-0', 'bg-black');
    });

    it('switches to a transparent backdrop at xl for the starfield', () => {
      const { container } = render(<Header />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      expect(bgDiv).toHaveClass('xl:bg-transparent');
    });
  });

  describe('sparkle effects', () => {
    it('renders sparkle container', () => {
      const { container } = render(<Header />);
      const sparkleContainer = container.querySelector('.pointer-events-none');
      expect(sparkleContainer).toBeInTheDocument();
      expect(sparkleContainer).toHaveClass('absolute', 'inset-0', 'z-10');
    });

    it('generates 20 sparkles and 15 extinguish particles', () => {
      const { container } = render(<Header />);
      const sparkles = container.querySelectorAll('.header-sparkle');
      const extinguish = container.querySelectorAll('.header-extinguish');
      expect(sparkles).toHaveLength(20);
      expect(extinguish).toHaveLength(15);
    });

    it('sparkles have absolute positioning', () => {
      const { container } = render(<Header />);
      const sparkle = container.querySelector('.header-sparkle');
      expect(sparkle).toHaveClass('absolute', 'rounded-full');
    });

    it('sparkle elements have percentage-based positions', () => {
      const { container } = render(<Header />);
      const sparkle = container.querySelector('.header-sparkle') as HTMLElement;
      expect(sparkle.style.left).toMatch(/%$/);
      expect(sparkle.style.top).toMatch(/%$/);
    });

    it('extinguish particles have orange color class', () => {
      const { container } = render(<Header />);
      const extinguishParticle = container.querySelector('.header-extinguish');
      expect(extinguishParticle).toHaveClass('bg-orange-400');
    });
  });

  describe('header content', () => {
    it('renders header element with flex layout', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('items-center');
      expect(header).toHaveClass('justify-between');
    });

    it('aligns content to the start at xl', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('xl:justify-start');
    });

    it('applies the compact base height', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('h-14.5');
    });

    it('grows to the tablet height at md to meet the hamburger sheet', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('md:h-[122px]');
    });

    it('grows to the desktop height at xl', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('xl:h-56');
    });

    it('renders content layer with proper z-index', () => {
      const { container } = render(<Header />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toBeInTheDocument();
    });

    it('content layer has max-width constraint', () => {
      const { container } = render(<Header />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toHaveClass('xl:max-w-480');
    });

    it('content layer has overflow hidden', () => {
      const { container } = render(<Header />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toHaveClass('overflow-hidden');
    });
  });
});
