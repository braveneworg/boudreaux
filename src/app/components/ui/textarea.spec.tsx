import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Textarea } from './textarea';

describe('Textarea', () => {
  describe('rendering', () => {
    it('should render the textarea', () => {
      render(<Textarea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<Textarea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('data-slot', 'textarea');
    });

    it('should render as textarea element', () => {
      render(<Textarea data-testid="textarea" />);
      expect(screen.getByTestId('textarea').tagName).toBe('TEXTAREA');
    });

    it('should have default styling classes', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('rounded-md');
      expect(textarea).toHaveClass('border');
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      render(<Textarea data-testid="textarea" className="custom-class" />);
      expect(screen.getByTestId('textarea')).toHaveClass('custom-class');
    });

    it('should merge custom className with default classes', () => {
      render(<Textarea data-testid="textarea" className="custom-class" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('rounded-md');
      expect(textarea).toHaveClass('custom-class');
    });
  });

  describe('standard textarea props', () => {
    it('should accept placeholder prop', () => {
      render(<Textarea data-testid="textarea" placeholder="Enter text..." />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('placeholder', 'Enter text...');
    });

    it('should accept disabled prop', () => {
      render(<Textarea data-testid="textarea" disabled />);
      expect(screen.getByTestId('textarea')).toBeDisabled();
    });

    it('should accept readOnly prop', () => {
      render(<Textarea data-testid="textarea" readOnly />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('readonly');
    });

    it('should accept rows prop', () => {
      render(<Textarea data-testid="textarea" rows={5} />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('rows', '5');
    });

    it('should accept name prop', () => {
      render(<Textarea data-testid="textarea" name="description" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('name', 'description');
    });

    it('should accept value prop', () => {
      render(<Textarea data-testid="textarea" value="test value" readOnly />);
      expect(screen.getByTestId('textarea')).toHaveValue('test value');
    });

    it('should accept defaultValue prop', () => {
      render(<Textarea data-testid="textarea" defaultValue="default text" />);
      expect(screen.getByTestId('textarea')).toHaveValue('default text');
    });
  });

  describe('events', () => {
    it('should handle onChange events', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Textarea data-testid="textarea" onChange={handleChange} />);

      const textarea = screen.getByTestId('textarea');
      await user.type(textarea, 'hello');

      expect(handleChange).toHaveBeenCalled();
    });

    it('should handle onFocus events', async () => {
      const user = userEvent.setup();
      const handleFocus = vi.fn();
      render(<Textarea data-testid="textarea" onFocus={handleFocus} />);

      const textarea = screen.getByTestId('textarea');
      await user.click(textarea);

      expect(handleFocus).toHaveBeenCalled();
    });

    it('should handle onBlur events', async () => {
      const user = userEvent.setup();
      const handleBlur = vi.fn();
      render(<Textarea data-testid="textarea" onBlur={handleBlur} />);

      const textarea = screen.getByTestId('textarea');
      await user.click(textarea);
      await user.tab();

      expect(handleBlur).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should accept aria-label prop', () => {
      render(<Textarea data-testid="textarea" aria-label="Description field" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('aria-label', 'Description field');
    });

    it('should accept aria-describedby prop', () => {
      render(<Textarea data-testid="textarea" aria-describedby="help-text" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('aria-describedby', 'help-text');
    });

    it('should accept required prop', () => {
      render(<Textarea data-testid="textarea" required />);
      expect(screen.getByTestId('textarea')).toBeRequired();
    });
  });
});
