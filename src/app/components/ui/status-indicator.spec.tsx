/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import StatusIndicator from '@/app/components/ui/status-indicator';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckIcon: ({ className }: { className?: string }) =>
    React.createElement('div', {
      'data-testid': 'check-icon',
      className,
    }),
  XIcon: ({ className }: { className?: string }) =>
    React.createElement('div', {
      'data-testid': 'x-icon',
      className,
    }),
  LoaderIcon: ({ className }: { className?: string }) =>
    React.createElement('div', {
      'data-testid': 'loader-icon',
      className,
    }),
}));

describe('StatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pending state', () => {
    it('should render loading spinner when isPending is true', () => {
      render(<StatusIndicator isPending />);

      const loader = screen.getByTestId('loader-icon');
      expect(loader).toBeInTheDocument();
      expect(loader).toHaveClass('animate-spin', 'text-blue-500');
    });

    it('should apply custom className when provided', () => {
      render(<StatusIndicator isPending className="custom-class" />);

      const container = screen.getByTestId('loader-icon').parentElement;
      expect(container).toHaveClass('custom-class');
    });

    it('should prioritize pending state over other states', () => {
      render(<StatusIndicator isPending isSuccess hasError hasTimeout />);

      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument();
    });
  });

  describe('timeout state', () => {
    it('should render error icon when hasTimeout is true', () => {
      render(<StatusIndicator hasTimeout />);

      const errorIcon = screen.getByTestId('x-icon');
      expect(errorIcon).toBeInTheDocument();
      expect(errorIcon).toHaveClass('text-red-600');
    });

    it('should apply red background styling for timeout', () => {
      render(<StatusIndicator hasTimeout />);

      const container = screen.getByTestId('x-icon').parentElement;
      expect(container).toHaveClass('bg-red-100', 'rounded-full');
    });

    it('should prioritize timeout over error and success states', () => {
      render(<StatusIndicator hasTimeout hasError isSuccess />);

      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      // Should only render one error icon, not multiple
      expect(screen.getAllByTestId('x-icon')).toHaveLength(1);
    });
  });

  describe('error state', () => {
    it('should render error icon when hasError is true', () => {
      render(<StatusIndicator hasError />);

      const errorIcon = screen.getByTestId('x-icon');
      expect(errorIcon).toBeInTheDocument();
      expect(errorIcon).toHaveClass('text-red-600');
    });

    it('should apply red background styling for error', () => {
      render(<StatusIndicator hasError />);

      const container = screen.getByTestId('x-icon').parentElement;
      expect(container).toHaveClass('bg-red-100', 'rounded-full');
    });

    it('should prioritize error over success state', () => {
      render(<StatusIndicator hasError isSuccess />);

      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
    });
  });

  describe('success state', () => {
    it('should render check icon when isSuccess is true', () => {
      render(<StatusIndicator isSuccess />);

      const checkIcon = screen.getByTestId('check-icon');
      expect(checkIcon).toBeInTheDocument();
      expect(checkIcon).toHaveClass('text-green-600');
    });

    it('should apply green background styling for success', () => {
      render(<StatusIndicator isSuccess />);

      const container = screen.getByTestId('check-icon').parentElement;
      expect(container).toHaveClass('bg-green-100', 'rounded-full');
    });

    it('should apply custom className when provided', () => {
      render(<StatusIndicator isSuccess className="success-custom" />);

      const container = screen.getByTestId('check-icon').parentElement;
      expect(container).toHaveClass('success-custom');
    });
  });

  describe('default state', () => {
    it('should render nothing when no states are active', () => {
      const { container } = render(<StatusIndicator />);

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('x-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
    });

    it('should render nothing when all states are false', () => {
      const { container } = render(
        <StatusIndicator isSuccess={false} hasError={false} hasTimeout={false} isPending={false} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('styling and layout', () => {
    it('should apply consistent size classes', () => {
      render(<StatusIndicator isSuccess />);

      const container = screen.getByTestId('check-icon').parentElement;
      expect(container).toHaveClass('w-6', 'h-6', 'flex', 'items-center', 'justify-center');
    });

    it('should merge custom className with default classes', () => {
      render(<StatusIndicator hasError className="border-2" />);

      const container = screen.getByTestId('x-icon').parentElement;
      expect(container).toHaveClass('border-2', 'w-6', 'h-6', 'bg-red-100');
    });

    it('should apply correct icon sizes', () => {
      render(<StatusIndicator isSuccess />);

      const icon = screen.getByTestId('check-icon');
      expect(icon).toHaveClass('w-4', 'h-4');
    });
  });

  describe('state priority hierarchy', () => {
    it('should follow correct priority: pending > timeout > error > success', () => {
      // Test all combinations to ensure priority is respected
      const testCases = [
        {
          props: {
            isPending: true,
            hasTimeout: true,
            hasError: true,
            isSuccess: true,
          },
          expected: 'loader-icon',
        },
        {
          props: { hasTimeout: true, hasError: true, isSuccess: true },
          expected: 'x-icon',
        },
        { props: { hasError: true, isSuccess: true }, expected: 'x-icon' },
        { props: { isSuccess: true }, expected: 'check-icon' },
      ];

      testCases.forEach(({ props, expected }) => {
        const { unmount } = render(<StatusIndicator {...props} />);
        expect(screen.getByTestId(expected)).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('accessibility', () => {
    it('should be focusable when needed', () => {
      render(<StatusIndicator isSuccess />);

      const container = screen.getByTestId('check-icon').parentElement;
      expect(container).toBeInTheDocument();
      // Icon containers should be visible to screen readers
      expect(container).not.toHaveAttribute('aria-hidden', 'true');
    });
  });
});
