import { render, screen } from '@testing-library/react';

import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  describe('rendering', () => {
    it('should render the skeleton div', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute('data-slot', 'skeleton');
    });

    it('should have default styling classes', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('bg-zinc-300');
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('rounded-md');
      expect(skeleton).toHaveClass('my-4');
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      render(<Skeleton data-testid="skeleton" className="custom-class" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('custom-class');
    });

    it('should merge custom className with default classes', () => {
      render(<Skeleton data-testid="skeleton" className="custom-class" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('bg-zinc-300');
      expect(skeleton).toHaveClass('custom-class');
    });

    it('should allow overriding width', () => {
      render(<Skeleton data-testid="skeleton" className="w-32" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('w-32');
    });

    it('should allow overriding height', () => {
      render(<Skeleton data-testid="skeleton" className="h-8" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('h-8');
    });
  });

  describe('additional props', () => {
    it('should pass through style prop', () => {
      render(<Skeleton data-testid="skeleton" style={{ width: '200px' }} />);
      expect(screen.getByTestId('skeleton')).toHaveStyle({ width: '200px' });
    });

    it('should pass through aria attributes', () => {
      render(<Skeleton data-testid="skeleton" aria-label="Loading content" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-label', 'Loading content');
    });

    it('should pass through role attribute', () => {
      render(<Skeleton data-testid="skeleton" role="progressbar" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute('role', 'progressbar');
    });
  });
});
