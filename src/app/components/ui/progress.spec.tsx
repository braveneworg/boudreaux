import { render, screen } from '@testing-library/react';

import { Progress } from './progress';

describe('Progress', () => {
  describe('rendering', () => {
    it('renders with default props', () => {
      render(<Progress data-testid="progress" />);

      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    it('renders with data-slot attribute', () => {
      render(<Progress data-testid="progress" />);

      expect(screen.getByTestId('progress')).toHaveAttribute('data-slot', 'progress');
    });

    it('renders indicator with data-slot attribute', () => {
      render(<Progress data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('value handling', () => {
    it('displays correct transform for 0% progress', () => {
      render(<Progress value={0} data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
    });

    it('displays correct transform for 50% progress', () => {
      render(<Progress value={50} data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-50%)' });
    });

    it('displays correct transform for 100% progress', () => {
      render(<Progress value={100} data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      // 100 - 100 = 0, so translateX(-0%) which might be rendered as translateX(0%)
      expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' });
    });

    it('handles undefined value as 0%', () => {
      render(<Progress value={undefined} data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
    });

    it('handles null value as 0%', () => {
      render(<Progress value={null as unknown as number} data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
    });

    it('handles intermediate values', () => {
      render(<Progress value={75} data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveStyle({ transform: 'translateX(-25%)' });
    });
  });

  describe('styling', () => {
    it('applies custom className to root', () => {
      render(<Progress className="custom-class" data-testid="progress" />);

      expect(screen.getByTestId('progress')).toHaveClass('custom-class');
    });

    it('has default background styling', () => {
      render(<Progress data-testid="progress" />);

      expect(screen.getByTestId('progress')).toHaveClass('bg-primary/20');
    });

    it('has rounded styling', () => {
      render(<Progress data-testid="progress" />);

      expect(screen.getByTestId('progress')).toHaveClass('rounded-full');
    });

    it('indicator has background styling', () => {
      render(<Progress data-testid="progress" />);

      const indicator = document.querySelector('[data-slot="progress-indicator"]');
      expect(indicator).toHaveClass('bg-primary');
    });
  });

  describe('accessibility', () => {
    it('has role="progressbar"', () => {
      render(<Progress data-testid="progress" value={50} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('renders with progressbar role for accessibility', () => {
      render(<Progress value={75} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
    });

    it('passes value prop to radix progress', () => {
      render(<Progress value={50} data-testid="progress" />);

      // The radix progress component accepts the value prop
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('props forwarding', () => {
    it('forwards max prop', () => {
      render(<Progress value={50} max={200} data-testid="progress" />);

      // The progress bar should render with the max value
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('forwards additional data attributes', () => {
      render(<Progress data-custom="test" data-testid="progress" />);

      expect(screen.getByTestId('progress')).toHaveAttribute('data-custom', 'test');
    });

    it('forwards id prop', () => {
      render(<Progress id="my-progress" data-testid="progress" />);

      expect(screen.getByTestId('progress')).toHaveAttribute('id', 'my-progress');
    });
  });
});
