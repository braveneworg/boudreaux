/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { HeaderMobile } from './header-mobile';

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

describe('HeaderMobile', () => {
  it('renders the mobile logo (isMobile=true)', () => {
    render(<HeaderMobile />);
    expect(screen.getByTestId('logo')).toHaveAttribute('data-is-mobile', 'true');
  });

  it('lazy-loads the mobile logo so its image is not fetched on desktop', () => {
    render(<HeaderMobile />);
    expect(screen.getByTestId('logo')).toHaveAttribute('data-priority', 'false');
  });

  it('renders the hamburger menu', () => {
    render(<HeaderMobile />);
    expect(screen.getByTestId('hamburger-menu')).toBeInTheDocument();
  });

  it('renders the mobile words image at the smaller width', () => {
    render(<HeaderMobile />);
    expect(screen.getByTestId('next-image')).toHaveAttribute('data-width', '222');
  });

  it('lazy-loads the wordmark image', () => {
    render(<HeaderMobile />);
    expect(screen.getByTestId('next-image')).toHaveAttribute('data-priority', 'false');
  });

  it('uses the Fake Four Inc. words asset', () => {
    render(<HeaderMobile />);
    expect(screen.getByTestId('next-image')).toHaveAttribute(
      'data-src',
      '/media/fake-four-inc-words-sans-hand.webp'
    );
  });

  it('hides at xl via the contents-toggle wrapper', () => {
    const { container } = render(<HeaderMobile />);
    expect(container.firstChild as HTMLElement).toHaveClass('contents', 'xl:hidden');
  });
});
