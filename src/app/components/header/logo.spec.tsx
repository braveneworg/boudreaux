/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { Logo } from './logo';

// Mock next/link to surface the prefetch posture as data attributes (Link
// behavior, not DOM attributes — the real component hides them).
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    unstable_dynamicOnHover,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
    unstable_dynamicOnHover?: boolean;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch === undefined ? 'default' : String(prefetch)}
      data-dynamic-on-hover={String(unstable_dynamicOnHover === true)}
      {...props}
    >
      {children}
    </a>
  ),
}));

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    width,
    height,
    priority,
    unoptimized,
    fill,
    ...props
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    priority?: boolean;
    unoptimized?: boolean;
    fill?: boolean;
    className?: string;
    [key: string]: unknown;
  }) => (
    <span
      data-testid="logo-image"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
      data-priority={priority ? 'true' : 'false'}
      data-unoptimized={unoptimized ? 'true' : 'false'}
      data-fill={fill ? 'true' : 'false'}
      {...props}
    />
  ),
}));

describe('Logo', () => {
  it('renders a link to home page wrapping the logo image', () => {
    render(<Logo isMobile={false} />);

    const link = screen.getByRole('link');
    const img = screen.getByTestId('logo-image');
    expect(link).toHaveAttribute('href', '/');
    expect(link).toContainElement(img);
  });

  it('keeps default prefetching and boosts the home route on hover', () => {
    render(<Logo isMobile={false} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-prefetch', 'default');
    expect(link).toHaveAttribute('data-dynamic-on-hover', 'true');
  });

  it('renders logo image with correct alt text and dimensions', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute('data-alt', 'Fake Four Inc. Hand Logo');
    expect(img).toHaveAttribute('data-width', '48');
    expect(img).toHaveAttribute('data-height', '48');
  });

  it('has priority loading and unoptimized flags', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute('data-priority', 'true');
    expect(img).toHaveAttribute('data-unoptimized', 'true');
  });

  it('lazy-loads when priority is false', () => {
    render(<Logo isMobile={false} priority={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute('data-priority', 'false');
  });

  it('has correct styling classes', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveClass('rounded-full', 'bg-zinc-50', 'size-10', 'xl:size-24');
  });

  it('renders the desktop logo as a 96px centered sticker', () => {
    render(<Logo isMobile={false} />);

    // The next/image mock renders a <span>, so select by testid (getByAltText
    // cannot match the span's data-alt attribute).
    const img = screen.getByTestId('logo-image');
    expect(img.className).toContain('xl:size-24');
    expect(img.className).toContain('xl:top-4');
    expect(img.className).toContain('xl:shadow-zine-ink');
    expect(img.className).not.toContain('xl:size-36');
  });

  describe('mobile vs desktop logo source', () => {
    it('uses mobile logo source when isMobile is true', () => {
      render(<Logo isMobile />);

      const img = screen.getByTestId('logo-image');
      expect(img).toHaveAttribute('data-src', '/media/fake-four-inc-black-hand-logo.svg');
    });

    it('uses desktop logo source when isMobile is false', () => {
      render(<Logo isMobile={false} />);

      const img = screen.getByTestId('logo-image');
      expect(img).toHaveAttribute('data-src', '/media/ffinc-black-hand-sans-words-stardust.webp');
    });

    it('serves both variants from the media directory', () => {
      const { unmount } = render(<Logo isMobile />);
      expect(screen.getByTestId('logo-image').getAttribute('data-src')).toMatch(/^\/media\/.+/);
      unmount();

      render(<Logo isMobile={false} />);
      expect(screen.getByTestId('logo-image').getAttribute('data-src')).toMatch(/^\/media\/.+/);
    });
  });
});
