/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import Header from './header';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      style,
      ...props
    }: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>) => (
      <div
        className={className}
        data-testid="motion-div"
        style={style}
        {...(props as React.HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    ),
  },
}));

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
  default: ({ isMobile }: { isMobile?: boolean }) => (
    <div data-is-mobile={isMobile} data-testid="logo">
      Logo
    </div>
  ),
}));

// Mock HamburgerMenu component
vi.mock('../ui/hamburger-menu', () => ({
  default: () => <div data-testid="hamburger-menu">HamburgerMenu</div>,
}));

describe('Header', () => {
  it('renders without crashing', () => {
    render(<Header />);
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('renders with sticky positioning', () => {
    const { container } = render(<Header />);
    const headerWrapper = container.firstChild as HTMLElement;
    expect(headerWrapper).toHaveClass('sticky');
    expect(headerWrapper).toHaveClass('top-0');
    expect(headerWrapper).toHaveClass('z-100');
  });

  it('renders full-width wrapper', () => {
    const { container } = render(<Header />);
    const headerWrapper = container.firstChild as HTMLElement;
    expect(headerWrapper).toHaveClass('w-full');
    expect(headerWrapper).toHaveClass('left-0');
    expect(headerWrapper).toHaveClass('right-0');
  });

  it('renders Logo component with isMobile=false by default', () => {
    render(<Header />);
    const logo = screen.getByTestId('logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('data-is-mobile', 'false');
  });

  it('renders Logo component with isMobile=true when passed', () => {
    render(<Header isMobile />);
    const logo = screen.getByTestId('logo');
    expect(logo).toHaveAttribute('data-is-mobile', 'true');
  });

  describe('mobile mode', () => {
    it('renders hamburger menu in mobile mode', () => {
      render(<Header isMobile />);
      expect(screen.getByTestId('hamburger-menu')).toBeInTheDocument();
    });

    it('renders Fake Four Inc words image in mobile mode', () => {
      render(<Header isMobile />);
      const image = screen.getByTestId('next-image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('data-src', '/media/fake-four-inc-words.png');
      expect(image).toHaveAttribute('data-alt', 'Fake Four Inc. Words');
    });

    it('renders image with correct dimensions', () => {
      render(<Header isMobile />);
      const image = screen.getByTestId('next-image');
      expect(image).toHaveAttribute('data-width', '222');
      expect(image).toHaveAttribute('data-height', '40');
    });

    it('image has priority flag set', () => {
      render(<Header isMobile />);
      const image = screen.getByTestId('next-image');
      expect(image).toHaveAttribute('data-priority', 'true');
    });

    it('renders both image and hamburger menu together', () => {
      render(<Header isMobile />);
      expect(screen.getByTestId('next-image')).toBeInTheDocument();
      expect(screen.getByTestId('hamburger-menu')).toBeInTheDocument();
    });
  });

  describe('desktop mode', () => {
    it('does not render hamburger menu in desktop mode', () => {
      render(<Header isMobile={false} />);
      expect(screen.queryByTestId('hamburger-menu')).not.toBeInTheDocument();
    });

    it('does not render Fake Four Inc words image in desktop mode', () => {
      render(<Header isMobile={false} />);
      expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    });
  });

  describe('animated background', () => {
    it('renders motion div for animated background', () => {
      render(<Header />);
      const motionDivs = screen.getAllByTestId('motion-div');
      expect(motionDivs.length).toBeGreaterThan(0);
    });

    it('renders background with particles SVG class', () => {
      render(<Header />);
      const motionDivs = screen.getAllByTestId('motion-div');
      const bgDiv = motionDivs[0];
      expect(bgDiv).toHaveClass('absolute', 'inset-0', 'bg-zinc-950');
    });
  });

  describe('sparkle effects', () => {
    it('renders sparkle container with suppressHydrationWarning', () => {
      const { container } = render(<Header />);
      const sparkleContainer = container.querySelector('[class*="pointer-events-none z-10"]');
      expect(sparkleContainer).toBeInTheDocument();
    });

    it('generates 20 sparkles and 15 extinguish particles', () => {
      render(<Header />);
      const motionDivs = screen.getAllByTestId('motion-div');
      // 1 animated background + 20 sparkles + 15 extinguish particles = 36
      expect(motionDivs).toHaveLength(36);
    });

    it('sparkles have absolute positioning', () => {
      render(<Header />);
      const motionDivs = screen.getAllByTestId('motion-div');
      // Sparkle divs start at index 1 (index 0 is the background)
      const sparkle = motionDivs[1];
      expect(sparkle).toHaveClass('absolute', 'rounded-full');
    });

    it('sparkle elements have percentage-based positions', () => {
      render(<Header />);
      const motionDivs = screen.getAllByTestId('motion-div');
      // Sparkle at index 1 has inline style with left/top percentages
      const sparkle = motionDivs[1];
      expect(sparkle.style.left).toMatch(/%$/);
      expect(sparkle.style.top).toMatch(/%$/);
    });

    it('extinguish particles have orange color class', () => {
      render(<Header />);
      const motionDivs = screen.getAllByTestId('motion-div');
      // Extinguish particles start after background (1) + sparkles (20) = index 21
      const extinguishParticle = motionDivs[21];
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

    it('applies desktop height styles', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('md:h-[122px]');
    });

    it('applies mobile height styles', () => {
      const { container } = render(<Header />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('h-[58px]');
    });

    it('renders content layer with proper z-index', () => {
      const { container } = render(<Header />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toBeInTheDocument();
    });

    it('content layer has max-width constraint', () => {
      const { container } = render(<Header />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toHaveClass('max-w-[1920px]');
    });

    it('content layer has overflow hidden', () => {
      const { container } = render(<Header />);
      const contentLayer = container.querySelector('.z-20');
      expect(contentLayer).toHaveClass('overflow-hidden');
    });
  });
});
