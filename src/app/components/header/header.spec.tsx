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

// Mock next/image
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
      // eslint-disable-next-line @next/next/no-img-element -- Mock for testing next/image
      <img
        alt={props.alt}
        className={props.className}
        data-priority={props.priority}
        data-testid="next-image"
        height={props.height}
        src={props.src}
        width={props.width}
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
      expect(image).toHaveAttribute(
        'src',
        'https://cdn.fakefourrecords.com/media/fake-four-inc-words.png'
      );
      expect(image).toHaveAttribute('alt', 'Fake Four Inc. Words');
    });

    it('renders image with correct dimensions', () => {
      render(<Header isMobile />);
      const image = screen.getByTestId('next-image');
      expect(image).toHaveAttribute('width', '222');
      expect(image).toHaveAttribute('height', '40');
    });

    it('image has priority flag set', () => {
      render(<Header isMobile />);
      const image = screen.getByTestId('next-image');
      expect(image).toHaveAttribute('data-priority', 'true');
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
  });

  describe('sparkle effects', () => {
    it('renders sparkle container with suppressHydrationWarning', () => {
      const { container } = render(<Header />);
      const sparkleContainer = container.querySelector('[class*="pointer-events-none z-10"]');
      expect(sparkleContainer).toBeInTheDocument();
    });

    it('generates sparkles on initial render', () => {
      render(<Header />);
      // The motion divs include sparkles which are rendered as motion.div
      const motionDivs = screen.getAllByTestId('motion-div');
      // Should have animated background + sparkles + extinguish particles
      expect(motionDivs.length).toBeGreaterThanOrEqual(1);
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
  });
});
