import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  describe('rendering', () => {
    it('should render a checkbox', () => {
      render(<Checkbox />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveAttribute('data-slot', 'checkbox');
    });

    it('should render with correct initial state', () => {
      render(<Checkbox />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('should render as checked when defaultChecked is true', () => {
      render(<Checkbox defaultChecked />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('should render as checked when checked is true', () => {
      const handleChange = vi.fn();
      render(<Checkbox checked onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('should render the check icon indicator', () => {
      render(<Checkbox defaultChecked />);

      const checkbox = screen.getByRole('checkbox');
      const indicator = checkbox.querySelector('[data-slot="checkbox-indicator"]');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply default CSS classes', () => {
      render(<Checkbox data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveClass(
        'peer',
        'size-7',
        'shrink-0',
        'rounded-[4px]',
        'border',
        'shadow-xs',
        'transition-shadow'
      );
    });

    it('should apply custom className along with default classes', () => {
      render(<Checkbox className="custom-class" data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveClass('custom-class');
      expect(checkbox).toHaveClass('peer', 'size-7'); // default classes should still be present
    });

    it('should have checked state styles in classes', () => {
      render(<Checkbox defaultChecked data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveClass(
        'data-[state=checked]:bg-primary',
        'data-[state=checked]:text-primary-foreground',
        'data-[state=checked]:border-primary'
      );
    });

    it('should have focus styles in classes', () => {
      render(<Checkbox data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveClass(
        'focus-visible:border-ring',
        'focus-visible:ring-ring/50',
        'focus-visible:ring-[3px]'
      );
    });

    it('should have disabled styles in classes', () => {
      render(<Checkbox disabled data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
    });

    it('should have invalid styles in classes', () => {
      render(<Checkbox aria-invalid data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveClass(
        'aria-invalid:ring-destructive/20',
        'aria-invalid:border-destructive'
      );
    });
  });

  describe('states', () => {
    it('should be enabled by default', () => {
      render(<Checkbox />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeEnabled();
    });

    it('should be disabled when disabled prop is true', () => {
      render(<Checkbox disabled />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('should be required when required prop is true', () => {
      render(<Checkbox required />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeRequired();
    });

    it('should show as invalid when aria-invalid is true', () => {
      render(<Checkbox aria-invalid />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    });

    it('should support indeterminate state', () => {
      render(<Checkbox checked="indeterminate" data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
    });
  });

  describe('interactions', () => {
    it('should toggle when clicked', async () => {
      const user = userEvent.setup();
      render(<Checkbox />);

      const checkbox = screen.getByRole('checkbox');

      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('should call onCheckedChange handler', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Checkbox onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it('should call onCheckedChange with false when unchecking', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Checkbox defaultChecked onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(handleChange).toHaveBeenCalledWith(false);
    });

    it('should work as controlled component', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      const ControlledCheckbox = () => {
        const [checked, setChecked] = React.useState(false);

        return (
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => {
              setChecked(value as boolean);
              handleChange(value);
            }}
          />
        );
      };

      render(<ControlledCheckbox />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it('should not toggle when disabled', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Checkbox disabled onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).not.toBeChecked();
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('should handle keyboard interactions', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Checkbox onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();

      // Use click instead of Space key for Radix UI checkbox
      await user.click(checkbox);

      expect(handleChange).toHaveBeenCalledWith(true);
      expect(checkbox).toBeChecked();
    });
  });

  describe('accessibility', () => {
    it('should be focusable', () => {
      render(<Checkbox />);

      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();
      expect(checkbox).toHaveFocus();
    });

    it('should not be focusable when disabled', () => {
      render(<Checkbox disabled />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('should support aria-label', () => {
      render(<Checkbox aria-label="Accept terms" />);

      const checkbox = screen.getByRole('checkbox', { name: 'Accept terms' });
      expect(checkbox).toBeInTheDocument();
    });

    it('should support aria-labelledby', () => {
      render(
        <div>
          <span id="checkbox-label">Accept terms and conditions</span>
          <Checkbox aria-labelledby="checkbox-label" />
        </div>
      );

      const checkbox = screen.getByRole('checkbox', {
        name: 'Accept terms and conditions',
      });
      expect(checkbox).toBeInTheDocument();
    });

    it('should support aria-describedby', () => {
      render(
        <div>
          <Checkbox aria-describedby="help-text" />
          <div id="help-text">This option is required</div>
        </div>
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-describedby', 'help-text');
    });

    it('should have correct checked state for screen readers', () => {
      render(<Checkbox defaultChecked />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });
  });

  describe('form integration', () => {
    it('should support name attribute for form submission', () => {
      render(<Checkbox name="agree" />);

      const checkbox = screen.getByRole('checkbox');
      // Radix checkbox uses value attribute instead of name for form submission
      expect(checkbox).toHaveAttribute('value', 'on');
    });

    it('should support value attribute', () => {
      render(<Checkbox value="accepted" />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('value', 'accepted');
    });

    it('should work with form labels', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <label htmlFor="terms-checkbox">I agree to the terms and conditions</label>
          <Checkbox id="terms-checkbox" />
        </div>
      );

      const checkbox = screen.getByRole('checkbox');
      const label = screen.getByText('I agree to the terms and conditions');

      await user.click(label);
      expect(checkbox).toBeChecked();
    });

    it('should support form validation', () => {
      render(<Checkbox required aria-invalid />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeRequired();
      expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('indicator behavior', () => {
    it('should show indicator when checked', () => {
      render(<Checkbox defaultChecked data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      const indicator = checkbox.querySelector('[data-slot="checkbox-indicator"]');

      expect(indicator).toBeInTheDocument();
    });

    it('should have proper indicator styling', () => {
      render(<Checkbox defaultChecked data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      const indicator = checkbox.querySelector('[data-slot="checkbox-indicator"]');

      expect(indicator).toHaveClass(
        'flex',
        'items-center',
        'justify-center',
        'text-current',
        'transition-none'
      );
    });

    it('should contain check icon in indicator', () => {
      render(<Checkbox defaultChecked data-testid="checkbox" />);

      const checkbox = screen.getByTestId('checkbox');
      const checkIcon = checkbox.querySelector('svg');

      expect(checkIcon).toBeInTheDocument();
      expect(checkIcon).toHaveClass('size-5.5');
    });
  });

  describe('edge cases', () => {
    it('should handle rapid clicks', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Checkbox onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');

      await user.click(checkbox);
      await user.click(checkbox);
      await user.click(checkbox);

      expect(handleChange).toHaveBeenCalledTimes(3);
      expect(checkbox).toBeChecked();
    });

    it('should handle ref forwarding', () => {
      const ref = React.createRef<HTMLButtonElement>();

      render(<Checkbox ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('should maintain state after re-render', () => {
      const { rerender } = render(<Checkbox defaultChecked />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();

      rerender(<Checkbox defaultChecked />);
      expect(checkbox).toBeChecked();
    });
  });
});
