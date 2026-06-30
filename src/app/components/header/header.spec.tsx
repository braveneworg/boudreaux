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

  it('centers and caps the container width at xl', () => {
    const { container } = render(<Header />);
    const headerWrapper = container.firstChild as HTMLElement;
    expect(headerWrapper).toHaveClass('mx-auto', 'xl:max-w-7xl');
  });

  it('renders the decorative backdrop layer', () => {
    const { container } = render(<Header />);
    expect(container.querySelector('.header-bg-pulse')).toBeInTheDocument();
  });

  it('renders the content layer', () => {
    const { container } = render(<Header />);
    expect(container.querySelector('header')).toBeInTheDocument();
  });
});
