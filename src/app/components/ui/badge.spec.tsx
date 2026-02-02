import { render, screen } from '@testing-library/react';

import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders', () => {
    render(<Badge>Badge</Badge>);

    expect(screen.getByText('Badge')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(<Badge data-testid="badge">Badge</Badge>);

    expect(screen.getByTestId('badge')).toHaveAttribute('data-slot', 'badge');
  });

  it('applies custom className', () => {
    render(
      <Badge data-testid="badge" className="custom-badge">
        Badge
      </Badge>
    );

    expect(screen.getByTestId('badge')).toHaveClass('custom-badge');
  });

  it('renders children', () => {
    render(<Badge>Badge content</Badge>);

    expect(screen.getByText('Badge content')).toBeInTheDocument();
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Badge data-testid="badge">Default</Badge>);

      expect(screen.getByTestId('badge')).toHaveClass('bg-primary');
    });

    it('renders secondary variant', () => {
      render(
        <Badge variant="secondary" data-testid="badge">
          Secondary
        </Badge>
      );

      expect(screen.getByTestId('badge')).toHaveClass('bg-secondary');
    });

    it('renders destructive variant', () => {
      render(
        <Badge variant="destructive" data-testid="badge">
          Destructive
        </Badge>
      );

      expect(screen.getByTestId('badge')).toHaveClass('bg-destructive');
    });

    it('renders outline variant', () => {
      render(
        <Badge variant="outline" data-testid="badge">
          Outline
        </Badge>
      );

      expect(screen.getByTestId('badge')).toHaveClass('text-foreground');
    });
  });

  describe('asChild', () => {
    it('renders as span by default', () => {
      render(<Badge data-testid="badge">Badge</Badge>);

      expect(screen.getByTestId('badge').tagName).toBe('SPAN');
    });

    it('renders child element when asChild is true', () => {
      render(
        <Badge asChild data-testid="badge">
          <a href="/link">Link Badge</a>
        </Badge>
      );

      expect(screen.getByTestId('badge').tagName).toBe('A');
      expect(screen.getByTestId('badge')).toHaveAttribute('href', '/link');
    });
  });

  it('passes additional props', () => {
    render(
      <Badge data-testid="badge" id="my-badge" aria-label="My badge">
        Badge
      </Badge>
    );

    expect(screen.getByTestId('badge')).toHaveAttribute('id', 'my-badge');
    expect(screen.getByTestId('badge')).toHaveAttribute('aria-label', 'My badge');
  });

  describe('badgeVariants', () => {
    it('returns default variant classes', () => {
      const classes = badgeVariants();
      expect(classes).toContain('bg-primary');
    });

    it('returns secondary variant classes', () => {
      const classes = badgeVariants({ variant: 'secondary' });
      expect(classes).toContain('bg-secondary');
    });

    it('returns destructive variant classes', () => {
      const classes = badgeVariants({ variant: 'destructive' });
      expect(classes).toContain('bg-destructive');
    });

    it('returns outline variant classes', () => {
      const classes = badgeVariants({ variant: 'outline' });
      expect(classes).toContain('text-foreground');
    });
  });
});
