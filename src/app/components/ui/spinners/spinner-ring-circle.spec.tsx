import { render, screen } from '@testing-library/react';

import { SpinnerRingCircle, spinnerVariants } from './spinner-ring-circle';

describe('SpinnerRingCircle', () => {
  describe('rendering', () => {
    it('should render a div element', () => {
      const { container } = render(<SpinnerRingCircle />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner.tagName.toLowerCase()).toBe('div');
    });

    it('should have aria-label for accessibility', () => {
      render(<SpinnerRingCircle />);

      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toBeInTheDocument();
    });

    it('should render with default props', () => {
      const { container } = render(<SpinnerRingCircle />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('animate-spin', 'rounded-full', 'border-2');
    });
  });

  describe('size variants', () => {
    it('should render with small size by default', () => {
      const { container } = render(<SpinnerRingCircle />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[16px]', 'w-[16px]');
    });

    it('should render with small size when explicitly set', () => {
      const { container } = render(<SpinnerRingCircle size="sm" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[16px]', 'w-[16px]');
    });

    it('should render with medium size', () => {
      const { container } = render(<SpinnerRingCircle size="md" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[50px]', 'w-[50px]');
    });

    it('should render with large size', () => {
      const { container } = render(<SpinnerRingCircle size="lg" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[70px]', 'w-[70px]');
    });
  });

  describe('color variants', () => {
    it('should render with default variant colors', () => {
      const { container } = render(<SpinnerRingCircle variant="default" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('[border-top-color:rgb(140,140,145)]');
      expect(spinner).toHaveClass('[border-right-color:rgb(90,90,95)]');
      expect(spinner).toHaveClass('[border-bottom-color:rgb(40,40,45)]');
      expect(spinner).toHaveClass('[border-left-color:rgb(10,10,15)]');
    });

    it('should render with primary variant colors', () => {
      const { container } = render(<SpinnerRingCircle variant="primary" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--primary))]');
      expect(spinner).toHaveClass('[border-right-color:hsl(var(--primary)/0.7)]');
      expect(spinner).toHaveClass('[border-bottom-color:hsl(var(--primary)/0.4)]');
      expect(spinner).toHaveClass('[border-left-color:hsl(var(--primary)/0.2)]');
    });

    it('should render with secondary variant colors', () => {
      const { container } = render(<SpinnerRingCircle variant="secondary" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--secondary))]');
      expect(spinner).toHaveClass('[border-right-color:hsl(var(--secondary)/0.7)]');
      expect(spinner).toHaveClass('[border-bottom-color:hsl(var(--secondary)/0.4)]');
      expect(spinner).toHaveClass('[border-left-color:hsl(var(--secondary)/0.2)]');
    });

    it('should render with accent variant colors', () => {
      const { container } = render(<SpinnerRingCircle variant="accent" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--accent))]');
      expect(spinner).toHaveClass('[border-right-color:hsl(var(--accent)/0.7)]');
      expect(spinner).toHaveClass('[border-bottom-color:hsl(var(--accent)/0.4)]');
      expect(spinner).toHaveClass('[border-left-color:hsl(var(--accent)/0.2)]');
    });
  });

  describe('combined size and variant props', () => {
    it('should handle small primary spinner', () => {
      const { container } = render(<SpinnerRingCircle size="sm" variant="primary" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[16px]', 'w-[16px]');
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--primary))]');
    });

    it('should handle medium secondary spinner', () => {
      const { container } = render(<SpinnerRingCircle size="md" variant="secondary" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[50px]', 'w-[50px]');
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--secondary))]');
    });

    it('should handle large accent spinner', () => {
      const { container } = render(<SpinnerRingCircle size="lg" variant="accent" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('h-[70px]', 'w-[70px]');
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--accent))]');
    });
  });

  describe('custom className prop', () => {
    it('should accept and apply custom className', () => {
      const { container } = render(<SpinnerRingCircle className="custom-spinner" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('custom-spinner');
    });

    it('should merge custom className with variant classes', () => {
      const { container } = render(<SpinnerRingCircle className="custom-class" size="md" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('custom-class');
      expect(spinner).toHaveClass('h-[50px]', 'w-[50px]');
      expect(spinner).toHaveClass('animate-spin', 'rounded-full');
    });

    it('should handle multiple custom classes', () => {
      const { container } = render(<SpinnerRingCircle className="class1 class2 class3" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('class1', 'class2', 'class3');
    });
  });

  describe('HTML attributes spread', () => {
    it('should accept and apply data attributes', () => {
      const { container } = render(<SpinnerRingCircle data-testid="test-spinner" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveAttribute('data-testid', 'test-spinner');
    });

    it('should accept and apply id attribute', () => {
      const { container } = render(<SpinnerRingCircle id="unique-spinner" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveAttribute('id', 'unique-spinner');
    });

    it('should accept and apply role attribute', () => {
      const { container } = render(<SpinnerRingCircle role="status" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveAttribute('role', 'status');
    });

    it('should accept style prop', () => {
      const { container } = render(<SpinnerRingCircle style={{ marginTop: '10px' }} />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveStyle({ marginTop: '10px' });
    });
  });

  describe('animation classes', () => {
    it('should have animate-spin class', () => {
      const { container } = render(<SpinnerRingCircle />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('animate-spin');
    });

    it('should have rounded-full class for circular shape', () => {
      const { container } = render(<SpinnerRingCircle />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('rounded-full');
    });

    it('should have border-2 class', () => {
      const { container } = render(<SpinnerRingCircle />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('border-2');
    });
  });

  describe('accessibility', () => {
    it('should have aria-label by default', () => {
      render(<SpinnerRingCircle />);

      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toBeInTheDocument();
    });

    it('should allow overriding aria-label', () => {
      render(<SpinnerRingCircle aria-label="Custom loading message" />);

      const spinner = screen.getByLabelText('Custom loading message');
      expect(spinner).toBeInTheDocument();
    });

    it('should work with role="status"', () => {
      const { container } = render(<SpinnerRingCircle role="status" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveAttribute('role', 'status');
      expect(spinner).toHaveAttribute('aria-label', 'Loading spinner');
    });

    it('should be perceivable by screen readers', () => {
      render(<SpinnerRingCircle />);

      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toBeVisible();
    });
  });

  describe('CVA variants integration', () => {
    it('should export spinnerVariants function', () => {
      expect(spinnerVariants).toBeDefined();
      expect(typeof spinnerVariants).toBe('function');
    });

    it('should generate correct classes with spinnerVariants', () => {
      const classes = spinnerVariants({ size: 'md', variant: 'primary' });

      expect(classes).toContain('h-[50px]');
      expect(classes).toContain('w-[50px]');
      expect(classes).toContain('[border-top-color:hsl(var(--primary))]');
    });

    it('should use default variants when none provided', () => {
      const classes = spinnerVariants({});

      expect(classes).toContain('h-[16px]');
      expect(classes).toContain('w-[16px]');
    });
  });

  describe('edge cases', () => {
    it('should render consistently across multiple instances', () => {
      const { rerender } = render(<SpinnerRingCircle size="sm" />);

      let spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('h-[16px]', 'w-[16px]');

      rerender(<SpinnerRingCircle size="lg" />);

      spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('h-[70px]', 'w-[70px]');
    });

    it('should handle empty className gracefully', () => {
      const { container } = render(<SpinnerRingCircle className="" />);

      const spinner = container.firstChild as HTMLElement;
      expect(spinner).toHaveClass('animate-spin', 'rounded-full');
    });

    it('should handle undefined props gracefully', () => {
      const { container } = render(<SpinnerRingCircle size={undefined} variant={undefined} />);

      const spinner = container.firstChild as HTMLElement;
      // Should use defaults
      expect(spinner).toHaveClass('h-[16px]', 'w-[16px]');
    });

    it('should work within different parent contexts', () => {
      const { container } = render(
        <div>
          <section>
            <SpinnerRingCircle />
          </section>
        </div>
      );

      const spinner = container.querySelector('[aria-label="Loading spinner"]');
      expect(spinner).toBeInTheDocument();
    });

    it('should handle rapid prop changes', () => {
      const { rerender } = render(<SpinnerRingCircle size="sm" variant="default" />);

      rerender(<SpinnerRingCircle size="md" variant="primary" />);
      rerender(<SpinnerRingCircle size="lg" variant="secondary" />);

      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('h-[70px]', 'w-[70px]');
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--secondary))]');
    });
  });

  describe('gradient effect', () => {
    it('should have gradient border colors from light to dark (default variant)', () => {
      const { container } = render(<SpinnerRingCircle variant="default" />);

      const spinner = container.firstChild as HTMLElement;

      // Gradient goes from light (140) to dark (10)
      expect(spinner).toHaveClass('[border-top-color:rgb(140,140,145)]');
      expect(spinner).toHaveClass('[border-right-color:rgb(90,90,95)]');
      expect(spinner).toHaveClass('[border-bottom-color:rgb(40,40,45)]');
      expect(spinner).toHaveClass('[border-left-color:rgb(10,10,15)]');
    });

    it('should have gradient opacity for theme variants', () => {
      const { container } = render(<SpinnerRingCircle variant="primary" />);

      const spinner = container.firstChild as HTMLElement;

      // Gradient uses opacity: 1.0, 0.7, 0.4, 0.2
      expect(spinner).toHaveClass('[border-top-color:hsl(var(--primary))]');
      expect(spinner).toHaveClass('[border-right-color:hsl(var(--primary)/0.7)]');
      expect(spinner).toHaveClass('[border-bottom-color:hsl(var(--primary)/0.4)]');
      expect(spinner).toHaveClass('[border-left-color:hsl(var(--primary)/0.2)]');
    });
  });

  describe('TypeScript type safety', () => {
    it('should accept SpinnerRingCircleProps interface', () => {
      const props: {
        size?: 'sm' | 'md' | 'lg';
        variant?: 'default' | 'primary' | 'secondary' | 'accent';
        className?: string;
      } = {
        size: 'md',
        variant: 'primary',
        className: 'test',
      };

      render(<SpinnerRingCircle {...props} />);

      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toBeInTheDocument();
    });

    it('should work without any props', () => {
      const { container } = render(<SpinnerRingCircle />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should accept VariantProps from CVA', () => {
      // This validates TypeScript compilation with CVA types
      const props = { size: 'lg' as const, variant: 'accent' as const };

      render(<SpinnerRingCircle {...props} />);

      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('h-[70px]', 'w-[70px]');
    });
  });
});
