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
  it('renders a link to home page', () => {
    render(<Logo isMobile={false} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders logo image', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('data-alt', 'Fake Four Inc. Hand Logo');
  });

  it('uses mobile logo source when isMobile is true', () => {
    render(<Logo isMobile />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute(
      'data-src',
      'https://cdn.fakefourrecords.com/media/fake-four-inc-black-hand-logo.svg'
    );
  });

  it('uses desktop logo source when isMobile is false', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute(
      'data-src',
      'https://cdn.fakefourrecords.com/media/fake-four-inc-black-stardust-hand-logo.svg'
    );
  });

  it('has priority loading enabled', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute('data-priority', 'true');
  });

  it('applies correct dimensions', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveAttribute('data-width', '48');
    expect(img).toHaveAttribute('data-height', '48');
  });

  it('has correct base styling classes', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByTestId('logo-image');
    expect(img).toHaveClass('rounded-full');
    expect(img).toHaveClass('bg-white');
  });
});
