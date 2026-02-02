import { render, screen } from '@testing-library/react';

import { AspectRatio } from './aspect-ratio';

describe('AspectRatio', () => {
  it('renders', () => {
    render(
      <AspectRatio ratio={16 / 9} data-testid="aspect-ratio">
        <div>Content</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('aspect-ratio')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(
      <AspectRatio ratio={16 / 9} data-testid="aspect-ratio">
        <div>Content</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('aspect-ratio')).toHaveAttribute('data-slot', 'aspect-ratio');
  });

  it('renders children', () => {
    render(
      <AspectRatio ratio={16 / 9}>
        <div data-testid="child">Child content</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders image inside aspect ratio', () => {
    render(
      <AspectRatio ratio={16 / 9}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Testing aspect ratio with plain img */}
        <img src="/test.jpg" alt="Test" data-testid="image" />
      </AspectRatio>
    );

    expect(screen.getByTestId('image')).toBeInTheDocument();
  });

  it('supports different ratios', () => {
    const { rerender } = render(
      <AspectRatio ratio={1} data-testid="aspect-ratio">
        <div>Square</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('aspect-ratio')).toBeInTheDocument();

    rerender(
      <AspectRatio ratio={4 / 3} data-testid="aspect-ratio">
        <div>4:3</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('aspect-ratio')).toBeInTheDocument();
  });

  it('passes additional props', () => {
    render(
      <AspectRatio ratio={16 / 9} data-testid="aspect-ratio" className="custom-class">
        <div>Content</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('aspect-ratio')).toHaveClass('custom-class');
  });

  it('renders without ratio (defaults)', () => {
    render(
      <AspectRatio data-testid="aspect-ratio">
        <div>Content</div>
      </AspectRatio>
    );

    expect(screen.getByTestId('aspect-ratio')).toBeInTheDocument();
  });
});
