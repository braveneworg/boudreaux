import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';

describe('Button', () => {
  describe('rendering', () => {
    it('should render with default variant and size', () => {
      render(<Button>Test Button</Button>);

      const button = screen.getByRole('button', { name: 'Test Button' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('data-slot', 'button');
    });

    it('should render children correctly', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('should render as child component when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );

      const link = screen.getByRole('link', { name: 'Link Button' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
      expect(link).toHaveAttribute('data-slot', 'button');
    });
  });

  describe('variants', () => {
    it('should apply default variant classes', () => {
      render(<Button>Default</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('should apply destructive variant classes', () => {
      render(<Button variant="destructive">Delete</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive', 'text-white');
    });

    it('should apply outline variant classes', () => {
      render(<Button variant="outline">Outline</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border', 'bg-background');
    });

    it('should apply secondary variant classes', () => {
      render(<Button variant="secondary">Secondary</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-secondary', 'text-secondary-foreground');
    });

    it('should apply ghost variant classes', () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent', 'hover:text-accent-foreground');
    });

    it('should apply link variant classes', () => {
      render(<Button variant="link">Link</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('text-primary', 'underline-offset-4');
    });
  });

  describe('sizes', () => {
    it('should apply default size classes', () => {
      render(<Button>Default Size</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-9', 'px-4', 'py-2');
    });

    it('should apply small size classes', () => {
      render(<Button size="sm">Small</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-8', 'px-3');
    });

    it('should apply large size classes', () => {
      render(<Button size="lg">Large</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-10', 'px-6');
    });

    it('should apply icon size classes', () => {
      render(<Button size="icon">Icon</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('size-9');
    });
  });

  describe('states', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50');
    });

    it('should apply custom className along with variant classes', () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
      expect(button).toHaveClass('bg-primary'); // default variant should still be applied
    });
  });

  describe('interactions', () => {
    it('should call onClick handler when clicked', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Click me</Button>);

      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>
      );

      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should handle keyboard interactions', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Keyboard</Button>);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should have correct button role', () => {
      render(<Button>Accessible</Button>);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should support aria-label', () => {
      render(<Button aria-label="Close dialog">×</Button>);

      const button = screen.getByRole('button', { name: 'Close dialog' });
      expect(button).toBeInTheDocument();
    });

    it('should support aria-describedby', () => {
      render(
        <div>
          <Button aria-describedby="help-text">Submit</Button>
          <div id="help-text">This will submit the form</div>
        </div>
      );

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).toHaveAttribute('aria-describedby', 'help-text');
    });

    it('should be focusable', () => {
      render(<Button>Focus me</Button>);

      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();
    });

    it('should not be focusable when disabled', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('HTML attributes', () => {
    it('should pass through HTML button attributes', () => {
      render(
        <Button type="submit" form="test-form" name="submit-button" value="submit">
          Submit
        </Button>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('form', 'test-form');
      expect(button).toHaveAttribute('name', 'submit-button');
      expect(button).toHaveAttribute('value', 'submit');
    });

    it('should support data attributes', () => {
      render(
        <Button data-testid="custom-button" data-custom="value">
          Test
        </Button>
      );

      const button = screen.getByTestId('custom-button');
      expect(button).toHaveAttribute('data-custom', 'value');
    });
  });

  describe('variant and size combinations', () => {
    it('should apply both variant and size classes correctly', () => {
      render(
        <Button variant="outline" size="lg">
          Large Outline
        </Button>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border', 'bg-background'); // outline variant
      expect(button).toHaveClass('h-10', 'px-6'); // large size
    });

    it('should handle all combinations without conflicts', () => {
      const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;
      const sizes = ['default', 'sm', 'lg', 'icon'] as const;

      variants.forEach((variant) => {
        sizes.forEach((size) => {
          const { unmount } = render(
            <Button variant={variant} size={size}>
              {variant} {size}
            </Button>
          );

          const button = screen.getByRole('button');
          expect(button).toBeInTheDocument();
          expect(button).toHaveClass('inline-flex'); // base class should always be present

          unmount();
        });
      });
    });
  });
});
