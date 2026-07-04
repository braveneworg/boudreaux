/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { HeaderDesktop } from './header-desktop';

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

// Mock DesktopMenu component (it depends on the client session hook)
vi.mock('../desktop-menu', () => ({
  DesktopMenu: () => <div data-testid="desktop-menu">DesktopMenu</div>,
}));

// Mock DesktopAuthMenu component (it depends on the client session hook)
vi.mock('../desktop-auth-menu', () => ({
  DesktopAuthMenu: () => <div data-testid="desktop-auth-menu">DesktopAuthMenu</div>,
}));

describe('HeaderDesktop', () => {
  it('renders the desktop logo (isMobile=false)', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('logo')).toHaveAttribute('data-is-mobile', 'false');
  });

  it('lazy-loads the desktop logo so its image is not fetched on phones', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('logo')).toHaveAttribute('data-priority', 'false');
  });

  it('renders the DesktopMenu', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('desktop-menu')).toBeInTheDocument();
  });

  it('renders the DesktopAuthMenu', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('desktop-auth-menu')).toBeInTheDocument();
  });

  it('renders the desktop words image at the larger width', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('next-image')).toHaveAttribute('data-width', '444');
  });

  it('lazy-loads the wordmark image', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('next-image')).toHaveAttribute('data-priority', 'false');
  });

  it('renders the wordmark at 48px, centered 18px from the top', () => {
    render(<HeaderDesktop />);
    // The next/image mock renders a <span data-alt=…>, so select the sole
    // wordmark image by testid and pin its identity via the alt data attribute.
    const wordmark = screen.getByTestId('next-image');
    expect(wordmark).toHaveAttribute('data-alt', 'Fake Four Inc. Words');
    expect(wordmark.className).toContain('top-[18px]');
    expect(wordmark.className).toContain('h-12');
  });

  it('uses the Fake Four Inc. words asset', () => {
    render(<HeaderDesktop />);
    expect(screen.getByTestId('next-image')).toHaveAttribute(
      'data-src',
      '/media/fake-four-inc-words-sans-hand.webp'
    );
  });

  it('hides below xl via the contents-toggle wrapper', () => {
    const { container } = render(<HeaderDesktop />);
    expect(container.firstChild as HTMLElement).toHaveClass('hidden', 'xl:contents');
  });
});
