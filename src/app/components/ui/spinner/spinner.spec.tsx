/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { Spinner, spinnerVariants } from './spinner';

describe('Spinner', () => {
  describe('rendering', () => {
    it('should render the spinner', () => {
      render(<Spinner />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toBeInTheDocument();
    });

    it('should have proper aria-label for accessibility', () => {
      render(<Spinner />);
      const spinner = screen.getByRole('generic', { name: 'Loading spinner' });
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('should render with default sm size', () => {
      render(<Spinner />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toContain('h-4');
      expect(spinner.className).toContain('w-4');
    });

    it('should render with sm size', () => {
      render(<Spinner size="sm" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toContain('h-4');
      expect(spinner.className).toContain('w-4');
    });

    it('should render with md size', () => {
      render(<Spinner size="md" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toMatch(/h-\[50px\]/);
      expect(spinner.className).toMatch(/w-\[50px\]/);
    });

    it('should render with lg size', () => {
      render(<Spinner size="lg" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toMatch(/h-\[70px\]/);
      expect(spinner.className).toMatch(/w-\[70px\]/);
    });
  });

  describe('variant styles', () => {
    it('should render with default variant', () => {
      render(<Spinner />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toContain('conic-gradient');
    });

    it('should render with primary variant', () => {
      render(<Spinner variant="primary" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toContain('--primary');
    });

    it('should render with secondary variant', () => {
      render(<Spinner variant="secondary" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toContain('--secondary');
    });

    it('should render with accent variant', () => {
      render(<Spinner variant="accent" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner.className).toContain('--accent');
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      render(<Spinner className="custom-class" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('custom-class');
    });

    it('should merge custom className with variant classes', () => {
      render(<Spinner className="custom-class" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('animate-spin');
      expect(spinner).toHaveClass('rounded-full');
      expect(spinner).toHaveClass('custom-class');
    });
  });

  describe('additional props', () => {
    it('should pass through data-testid', () => {
      render(<Spinner data-testid="test-spinner" />);
      expect(screen.getByTestId('test-spinner')).toBeInTheDocument();
    });

    it('should pass through style prop', () => {
      render(<Spinner style={{ opacity: 0.5 }} />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveStyle({ opacity: '0.5' });
    });

    it('should pass through id prop', () => {
      render(<Spinner id="my-spinner" />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveAttribute('id', 'my-spinner');
    });
  });

  describe('spinnerVariants', () => {
    it('should export spinnerVariants function', () => {
      expect(typeof spinnerVariants).toBe('function');
    });

    it('should generate correct classes for sm size', () => {
      const classes = spinnerVariants({ size: 'sm' });
      expect(classes).toContain('h-4');
    });

    it('should generate correct classes for md size', () => {
      const classes = spinnerVariants({ size: 'md' });
      expect(classes).toMatch(/h-\[50px\]/);
    });

    it('should generate correct classes for lg size', () => {
      const classes = spinnerVariants({ size: 'lg' });
      expect(classes).toMatch(/h-\[70px\]/);
    });

    it('should generate correct classes for primary variant', () => {
      const classes = spinnerVariants({ variant: 'primary' });
      expect(classes).toContain('--primary');
    });

    it('should generate correct classes for secondary variant', () => {
      const classes = spinnerVariants({ variant: 'secondary' });
      expect(classes).toContain('--secondary');
    });

    it('should generate correct classes for accent variant', () => {
      const classes = spinnerVariants({ variant: 'accent' });
      expect(classes).toContain('--accent');
    });

    it('should generate correct default classes', () => {
      const classes = spinnerVariants({});
      expect(classes).toContain('animate-spin');
      expect(classes).toContain('rounded-full');
    });
  });

  describe('animation', () => {
    it('should have animate-spin class', () => {
      render(<Spinner />);
      const spinner = screen.getByLabelText('Loading spinner');
      expect(spinner).toHaveClass('animate-spin');
    });
  });
});
