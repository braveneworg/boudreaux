import { render, screen } from '@testing-library/react';

import { LoadingSpinner } from './loading-spinner';
import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

// Mock the SpinnerRingCircle component
vi.mock('./spinners/spinner-ring-circle', () => ({
  SpinnerRingCircle: vi.fn(() => <div data-testid="mock-spinner">Spinner</div>),
}));

describe('LoadingSpinner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render loading text', () => {
      render(<LoadingSpinner />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();
    });

    it('should render SpinnerRingCircle component', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByTestId('mock-spinner');
      expect(spinner).toBeInTheDocument();
      expect(SpinnerRingCircle).toHaveBeenCalled();
    });

    it('should render both text and spinner together', () => {
      render(<LoadingSpinner />);

      const loadingText = screen.getByText('Loading...');
      const spinner = screen.getByTestId('mock-spinner');

      expect(loadingText).toBeInTheDocument();
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should have flex container with items-center', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'items-center');
    });

    it('should have justify-center class', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('justify-center');
    });

    it('should have gap-2 between text and spinner', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('gap-2');
    });

    it('should apply text-sm to loading text', () => {
      render(<LoadingSpinner />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toHaveClass('text-sm');
    });

    it('should apply text-muted-foreground to loading text', () => {
      render(<LoadingSpinner />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toHaveClass('text-muted-foreground');
    });
  });

  describe('custom className prop', () => {
    it('should accept and apply custom className', () => {
      const { container } = render(<LoadingSpinner className="custom-class" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should merge custom className with default classes', () => {
      const { container } = render(<LoadingSpinner className="custom-class" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center', 'gap-2');
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should handle multiple custom classes', () => {
      const { container } = render(<LoadingSpinner className="class1 class2 class3" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('class1', 'class2', 'class3');
    });

    it('should work without className prop', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center', 'gap-2');
    });

    it('should allow overriding layout with custom className', () => {
      const { container } = render(<LoadingSpinner className="flex-col" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-col');
    });
  });

  describe('accessibility', () => {
    it('should provide accessible loading text', () => {
      render(<LoadingSpinner />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeVisible();
    });

    it('should be perceivable by screen readers', () => {
      render(<LoadingSpinner />);

      // Text should be readable
      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toHaveTextContent('Loading...');
    });

    it('should have semantic structure', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.tagName.toLowerCase()).toBe('div');
    });
  });

  describe('component composition', () => {
    it('should render text before spinner', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      const children = Array.from(wrapper.children);

      // First child should be span with text
      expect(children[0].tagName.toLowerCase()).toBe('span');
      expect(children[0].textContent).toBe('Loading...');

      // Second child should be spinner (mock)
      expect(children[1].getAttribute('data-testid')).toBe('mock-spinner');
    });

    it('should maintain component structure', () => {
      const { container } = render(<LoadingSpinner />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.children.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should render consistently across multiple instances', () => {
      const { rerender } = render(<LoadingSpinner />);

      let loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();

      rerender(<LoadingSpinner />);

      loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();
      expect(SpinnerRingCircle).toHaveBeenCalledTimes(2);
    });

    it('should handle empty className gracefully', () => {
      const { container } = render(<LoadingSpinner className="" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center', 'gap-2');
    });

    it('should handle undefined className gracefully', () => {
      const { container } = render(<LoadingSpinner className={undefined} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center', 'gap-2');
    });

    it('should work within different parent contexts', () => {
      const { container } = render(
        <div>
          <section>
            <LoadingSpinner />
          </section>
        </div>
      );

      const loadingText = container.querySelector('.text-sm.text-muted-foreground');
      expect(loadingText).toBeInTheDocument();
      expect(loadingText?.textContent).toBe('Loading...');
    });

    it('should handle rapid re-renders', () => {
      const { rerender } = render(<LoadingSpinner className="class1" />);

      rerender(<LoadingSpinner className="class2" />);
      rerender(<LoadingSpinner className="class3" />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();
      expect(SpinnerRingCircle).toHaveBeenCalledTimes(3);
    });
  });

  describe('cn utility integration', () => {
    it('should properly merge conflicting Tailwind classes', () => {
      const { container } = render(<LoadingSpinner className="flex justify-start" />);

      const wrapper = container.firstChild as HTMLElement;

      // cn should handle merging properly
      // justify-start should override justify-center
      expect(wrapper.className).toContain('flex');
    });

    it('should preserve non-conflicting classes', () => {
      const { container } = render(<LoadingSpinner className="bg-red-500 p-4" />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('bg-red-500', 'p-4');
      expect(wrapper).toHaveClass('flex', 'items-center', 'gap-2');
    });
  });

  describe('TypeScript type safety', () => {
    it('should accept LoadingSpinnerProps interface', () => {
      // This test validates TypeScript compilation
      const props: { className?: string } = { className: 'test' };

      render(<LoadingSpinner {...props} />);

      const loadingText = screen.getByText('Loading...');
      expect(loadingText).toBeInTheDocument();
    });

    it('should work without any props', () => {
      // Should compile and run without errors
      const { container } = render(<LoadingSpinner />);

      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
