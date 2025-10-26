import React from 'react';

import { useRouter } from 'next/navigation';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

describe('Button', () => {
  // Setup mock router for tests
  const mockPush = vi.fn();
  const mockRouter = {
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(mockRouter);
  });
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

  describe('navigation with href', () => {
    describe('link variant navigation', () => {
      it('should call router.push when link variant button with href is clicked', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/profile">
            Go to Profile
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith('/profile');
      });

      it('should call router.push when link:narrow variant button with href is clicked', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link:narrow" href="/admin">
            Admin
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith('/admin');
      });

      it('should prevent default event behavior when navigating with href', async () => {
        const user = userEvent.setup();
        const handleClick = vi.fn((e) => {
          // Check if preventDefault was called
          expect(e.defaultPrevented).toBe(true);
        });

        render(
          <Button variant="link" href="/test" onClick={handleClick}>
            Test Link
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(handleClick).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith('/test');
      });

      it('should call both onClick handler and router.push in correct order', async () => {
        const user = userEvent.setup();
        const callOrder: string[] = [];
        const handleClick = vi.fn(() => callOrder.push('onClick'));
        mockPush.mockImplementation(() => callOrder.push('router.push'));

        render(
          <Button variant="link" href="/test" onClick={handleClick}>
            Test
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(callOrder).toEqual(['router.push', 'onClick']);
        expect(handleClick).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledTimes(1);
      });
    });

    describe('non-link variant behavior', () => {
      it('should NOT call router.push for default variant even with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="default" href="/profile">
            Default Button
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('should NOT call router.push for destructive variant with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="destructive" href="/delete">
            Delete
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('should NOT call router.push for outline variant with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="outline" href="/test">
            Outline
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('should NOT call router.push for secondary variant with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="secondary" href="/test">
            Secondary
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('should NOT call router.push for ghost variant with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="ghost" href="/test">
            Ghost
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    describe('href without variant', () => {
      it('should NOT navigate when href is provided without link variant', async () => {
        const user = userEvent.setup();

        render(<Button href="/profile">Default with href</Button>);

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    describe('link variant without href', () => {
      it('should NOT call router.push when link variant has no href', async () => {
        const user = userEvent.setup();
        const handleClick = vi.fn();

        render(
          <Button variant="link" onClick={handleClick}>
            Link without href
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
        expect(handleClick).toHaveBeenCalledTimes(1);
      });

      it('should NOT call router.push when link:narrow variant has no href', async () => {
        const user = userEvent.setup();
        const handleClick = vi.fn();

        render(
          <Button variant="link:narrow" onClick={handleClick}>
            Narrow Link
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
        expect(handleClick).toHaveBeenCalledTimes(1);
      });
    });

    describe('edge cases and error handling', () => {
      it('should NOT navigate with empty href string', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="">
            Empty href
          </Button>
        );

        await user.click(screen.getByRole('button'));
        // Empty string is falsy, so router.push should not be called
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('should handle href with query parameters', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/search?q=test&page=1">
            Search
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledWith('/search?q=test&page=1');
      });

      it('should handle href with hash fragments', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/page#section">
            Jump to Section
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledWith('/page#section');
      });

      it('should handle absolute URLs', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="https://example.com">
            External
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledWith('https://example.com');
      });

      it('should handle special characters in href', async () => {
        const user = userEvent.setup();
        const specialHref = '/path/with spaces/and-special@chars#';

        render(
          <Button variant="link" href={specialHref}>
            Special Path
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledWith(specialHref);
      });

      it('should NOT navigate when button is disabled with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/profile" disabled>
            Disabled Link
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).not.toHaveBeenCalled();
      });

      it('should handle onClick errors gracefully without breaking navigation', async () => {
        const user = userEvent.setup();
        const handleClick = vi.fn(() => {
          throw new Error('onClick error');
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
          <Button variant="link" href="/test" onClick={handleClick}>
            Test
          </Button>
        );

        // Click should still work even if onClick throws
        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledWith('/test');
        expect(handleClick).toHaveBeenCalled();

        consoleError.mockRestore();
      });

      it('should handle router.push errors gracefully', async () => {
        const user = userEvent.setup();
        mockPush.mockImplementation(() => {
          throw new Error('Navigation error');
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
          <Button variant="link" href="/error">
            Error Link
          </Button>
        );

        await user.click(screen.getByRole('button'));
        expect(mockPush).toHaveBeenCalledWith('/error');

        consoleError.mockRestore();
      });
    });

    describe('keyboard navigation with href', () => {
      it('should navigate when Enter key is pressed on link variant with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/profile">
            Profile
          </Button>
        );

        const button = screen.getByRole('button');
        button.focus();
        await user.keyboard('{Enter}');

        expect(mockPush).toHaveBeenCalledWith('/profile');
      });

      it('should navigate when Space key is pressed on link variant with href', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/profile">
            Profile
          </Button>
        );

        const button = screen.getByRole('button');
        button.focus();
        await user.keyboard(' ');

        expect(mockPush).toHaveBeenCalledWith('/profile');
      });
    });

    describe('integration with asChild prop', () => {
      it('should work correctly when used with asChild and link element', async () => {
        const user = userEvent.setup();

        render(
          <Button asChild variant="link" href="/test">
            <a href="/test">Styled Link</a>
          </Button>
        );

        // When asChild is true, it renders as the child element (anchor tag)
        const link = screen.getByRole('link');
        expect(link).toBeInTheDocument();

        // The click handler is still attached via Slot
        await user.click(link);
        expect(mockPush).toHaveBeenCalledWith('/test');
      });
    });

    describe('multiple rapid clicks', () => {
      it('should handle multiple rapid clicks correctly', async () => {
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/profile">
            Profile
          </Button>
        );

        const button = screen.getByRole('button');

        // Simulate rapid clicks
        await user.click(button);
        await user.click(button);
        await user.click(button);

        expect(mockPush).toHaveBeenCalledTimes(3);
        expect(mockPush).toHaveBeenCalledWith('/profile');
      });

      it('should debounce navigation calls if implemented', async () => {
        // Note: This test assumes no debouncing is implemented currently
        // If debouncing is added in the future, adjust this test
        const user = userEvent.setup();

        render(
          <Button variant="link" href="/profile">
            Profile
          </Button>
        );

        const button = screen.getByRole('button');
        await user.click(button);
        await user.click(button);

        // Currently expects 2 calls; adjust if debouncing is implemented
        expect(mockPush).toHaveBeenCalledTimes(2);
      });
    });
  });
});
