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
    ...props
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    priority?: boolean;
    className?: string;
    [key: string]: unknown;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      data-priority={priority ? 'true' : 'false'}
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

    expect(screen.getByAltText('Fake Four Inc. Hand Logo')).toBeInTheDocument();
  });

  it('uses mobile logo source when isMobile is true', () => {
    render(<Logo isMobile />);

    const img = screen.getByAltText('Fake Four Inc. Hand Logo');
    expect(img).toHaveAttribute('src', '/media/fake-four-inc-black-hand-logo.svg');
  });

  it('uses desktop logo source when isMobile is false', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByAltText('Fake Four Inc. Hand Logo');
    expect(img).toHaveAttribute('src', '/media/fake-four-inc-black-stardust-hand-logo.svg');
  });

  it('has priority loading enabled', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByAltText('Fake Four Inc. Hand Logo');
    expect(img).toHaveAttribute('data-priority', 'true');
  });

  it('applies correct dimensions', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByAltText('Fake Four Inc. Hand Logo');
    expect(img).toHaveAttribute('width', '48');
    expect(img).toHaveAttribute('height', '48');
  });

  it('has correct base styling classes', () => {
    render(<Logo isMobile={false} />);

    const img = screen.getByAltText('Fake Four Inc. Hand Logo');
    expect(img).toHaveClass('rounded-full');
    expect(img).toHaveClass('bg-white');
  });
});
