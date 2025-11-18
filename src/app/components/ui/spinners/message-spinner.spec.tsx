import { render, screen } from '@testing-library/react';

import { MessageSpinner } from './message-spinner';

vi.mock('./spinner-ring-circle', () => ({
  SpinnerRingCircle: ({ size, variant }: { size: string; variant: string }) => (
    <div data-testid="spinner-ring-circle" data-size={size} data-variant={variant} />
  ),
}));

describe('MessageSpinner', () => {
  describe('rendering', () => {
    it('should render the title', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="default" />);

      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });

    it('should render the SpinnerRingCircle component', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="default" />);

      expect(screen.getByTestId('spinner-ring-circle')).toBeInTheDocument();
    });

    it('should pass size prop to SpinnerRingCircle', () => {
      render(<MessageSpinner title="Loading..." size="lg" variant="default" />);

      const spinner = screen.getByTestId('spinner-ring-circle');
      expect(spinner).toHaveAttribute('data-size', 'lg');
    });

    it('should pass variant prop to SpinnerRingCircle', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="primary" />);

      const spinner = screen.getByTestId('spinner-ring-circle');
      expect(spinner).toHaveAttribute('data-variant', 'primary');
    });
  });

  describe('size variants', () => {
    describe('small size', () => {
      it('should apply small gap spacing', () => {
        const { container } = render(
          <MessageSpinner title="Loading..." size="sm" variant="default" />
        );

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('gap-2');
      });

      it('should apply small text size to title', () => {
        render(<MessageSpinner title="Loading..." size="sm" variant="default" />);

        const title = screen.getByText(/Loading/i);
        expect(title).toHaveClass('text-sm');
      });

      it('should apply small container dimensions', () => {
        const { container } = render(
          <MessageSpinner title="Loading..." size="sm" variant="default" />
        );

        // The wrapper has the spinner container size class (h-8 w-full for small)
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('h-8', 'w-full');
      });
    });

    describe('medium size', () => {
      it('should apply medium gap spacing', () => {
        const { container } = render(
          <MessageSpinner title="Loading..." size="md" variant="default" />
        );

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('gap-4');
      });

      it('should apply medium text size to title', () => {
        render(<MessageSpinner title="Loading..." size="md" variant="default" />);

        const title = screen.getByText(/Loading/i);
        expect(title).toHaveClass('text-lg');
      });

      it('should apply medium container dimensions', () => {
        const { container } = render(
          <MessageSpinner title="Loading..." size="md" variant="default" />
        );

        // Find the inner container div with size classes
        const innerContainer = container.querySelector('.h-8');
        expect(innerContainer).toBeInTheDocument();
        expect(innerContainer).toHaveClass('w-8');
      });
    });

    describe('large size', () => {
      it('should apply large gap spacing', () => {
        const { container } = render(
          <MessageSpinner title="Loading..." size="lg" variant="default" />
        );

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('gap-6');
      });

      it('should apply large text size to title', () => {
        render(<MessageSpinner title="Loading..." size="lg" variant="default" />);

        const title = screen.getByText(/Loading/i);
        expect(title).toHaveClass('text-2xl');
      });

      it('should apply large container dimensions', () => {
        const { container } = render(
          <MessageSpinner title="Loading..." size="lg" variant="default" />
        );

        // Find the inner container div with size classes
        const innerContainer = container.querySelector('.h-10');
        expect(innerContainer).toBeInTheDocument();
        expect(innerContainer).toHaveClass('w-10');
      });
    });
  });

  describe('spinner variants', () => {
    it('should render with default variant', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="default" />);

      const spinner = screen.getByTestId('spinner-ring-circle');
      expect(spinner).toHaveAttribute('data-variant', 'default');
    });

    it('should render with primary variant', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="primary" />);

      const spinner = screen.getByTestId('spinner-ring-circle');
      expect(spinner).toHaveAttribute('data-variant', 'primary');
    });

    it('should render with accent variant', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="accent" />);

      const spinner = screen.getByTestId('spinner-ring-circle');
      expect(spinner).toHaveAttribute('data-variant', 'accent');
    });
  });

  describe('className prop', () => {
    it('should apply custom className to wrapper', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="md" variant="default" className="custom-class" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should merge custom className with variant classes', () => {
      const { container } = render(
        <MessageSpinner
          title="Loading..."
          size="sm"
          variant="default"
          className="my-custom-class"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass(
        'my-custom-class',
        'gap-2',
        'flex',
        'justify-center',
        'items-center'
      );
    });
  });

  describe('layout structure', () => {
    it('should have flex column layout', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="md" variant="default" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'justify-center', 'items-center');
    });

    it('should have centered spinner container', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="md" variant="default" />
      );

      // The main wrapper has flex, items-center, justify-center
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center');
    });

    it('should have proper layout structure with inner container', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="md" variant="default" />
      );

      // Check that the inner container exists with flex classes
      const innerContainer = container.querySelector('.h-8.w-8');
      expect(innerContainer).toBeInTheDocument();
      expect(innerContainer).toHaveClass('flex', 'justify-center', 'items-center');
    });
  });

  describe('accessibility', () => {
    it('should render title text element', () => {
      render(<MessageSpinner title="Loading..." size="md" variant="default" />);

      const title = screen.getByText(/Loading/i);
      expect(title.tagName).toBe('SPAN');
    });

    it('should display the provided title text', () => {
      render(<MessageSpinner title="Please wait..." size="md" variant="default" />);

      expect(screen.getByText(/Please wait/i)).toBeInTheDocument();
    });
  });

  describe('size and variant combinations', () => {
    it('should render all elements with correct defaults for small size', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="sm" variant="default" />
      );

      const wrapper = container.firstChild as HTMLElement;
      const title = screen.getByText(/Loading/i);
      const spinner = screen.getByTestId('spinner-ring-circle');

      expect(wrapper).toHaveClass('gap-2');
      expect(title).toHaveClass('text-sm');
      expect(spinner).toHaveAttribute('data-variant', 'default');
    });

    it('should render all elements with correct defaults for medium size and primary variant', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="md" variant="primary" />
      );

      const wrapper = container.firstChild as HTMLElement;
      const title = screen.getByText(/Loading/i);
      const spinner = screen.getByTestId('spinner-ring-circle');

      expect(wrapper).toHaveClass('gap-4');
      expect(title).toHaveClass('text-lg');
      expect(spinner).toHaveAttribute('data-variant', 'primary');
    });

    it('should render all elements with correct defaults for large size and accent variant', () => {
      const { container } = render(
        <MessageSpinner title="Loading..." size="lg" variant="accent" />
      );

      const wrapper = container.firstChild as HTMLElement;
      const title = screen.getByText(/Loading/i);
      const spinner = screen.getByTestId('spinner-ring-circle');

      expect(wrapper).toHaveClass('gap-6');
      expect(title).toHaveClass('text-2xl');
      expect(spinner).toHaveAttribute('data-variant', 'accent');
    });
  });

  describe('Accessibility', () => {
    it('should use default variant when not provided', () => {
      render(<MessageSpinner title="Loading..." size="md" />);

      const spinner = screen.getByTestId('spinner-ring-circle');
      expect(spinner).toHaveAttribute('data-variant', 'default');
    });

    it('should use default message when not provided', () => {
      render(<MessageSpinner size="md" variant="default" />);

      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });

    it('should use medium size by default for heading when not provided', () => {
      render(<MessageSpinner variant="default" />);

      const title = screen.getByText(/Loading/i);
      expect(title).toHaveClass('text-sm');
    });
  });

  describe('MessageHeading2 component', () => {
    it('should render with provided message', () => {
      render(<MessageSpinner title="Custom message" size="md" variant="default" />);

      expect(screen.getByText(/Custom message/i)).toBeInTheDocument();
    });

    it('should apply correct size classes', () => {
      render(<MessageSpinner title="Test" size="sm" variant="default" />);

      const title = screen.getByText(/Test/i);
      expect(title).toHaveClass('text-sm');
    });
  });
});
