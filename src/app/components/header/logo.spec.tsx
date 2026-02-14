import { render, screen } from '@testing-library/react';

import Logo from './logo';

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

  it('has correct styling classes', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveClass('rounded-full', 'bg-white', 'size-12', 'md:size-36');
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
      expect(img).toHaveAttribute('data-src', '/media/fake-four-inc-black-stardust-hand-logo.svg');
    });

    it('both variants use SVG format', () => {
      const { unmount } = render(<Logo isMobile />);
      expect(screen.getByTestId('logo-image').getAttribute('data-src')).toMatch(
        /^\/media\/.*\.svg$/
      );
      unmount();

      render(<Logo isMobile={false} />);
      expect(screen.getByTestId('logo-image').getAttribute('data-src')).toMatch(
        /^\/media\/.*\.svg$/
      );
    });
  });
});
