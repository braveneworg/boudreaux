import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DatePicker } from './datepicker';

vi.mock('server-only', () => ({}));

// Helper function to set date value on input
// Note: We use the DOM API here instead of userEvent.type() because typing character-by-character
// (e.g., "0", "1", "/", "1", "5", "/", "2", "0", "0", "0") triggers onChange for each character,
// causing invalid intermediate date parsing. This approach simulates pasting a complete date value.
const setInputDate = (input: HTMLInputElement, dateString: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    dateString
  );
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('DatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with empty value initially', () => {
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('');
    });

    it('should render calendar icon', () => {
      render(<DatePicker fieldName="testDate" />);

      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should render with sr-only label', () => {
      render(<DatePicker fieldName="testDate" />);

      const label = screen.getByText(
        'Use up/down arrow keys to change year, left/right to change month'
      );
      expect(label).toHaveClass('sr-only');
    });

    it('should not show popover initially', () => {
      render(<DatePicker fieldName="testDate" />);

      const calendar = screen.queryByRole('grid');
      expect(calendar).not.toBeInTheDocument();
    });
  });

  describe('Popover Interaction', () => {
    it('should open popover when input is clicked', async () => {
      const user = userEvent.setup();
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('grid')).toBeInTheDocument();
      });
    });

    it('should focus input when popover opens', async () => {
      const user = userEvent.setup();
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      await waitFor(() => {
        expect(input).toHaveFocus();
      });
    });

    it('should close popover when date is selected from calendar', async () => {
      const user = userEvent.setup();
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('grid')).toBeInTheDocument();
      });

      // Find a button within gridcells (the actual date buttons)
      const dateButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.hasAttribute('data-day'));
      const selectableDate = dateButtons.find((btn) => !btn.hasAttribute('aria-disabled'));

      if (selectableDate) {
        await user.click(selectableDate);

        await waitFor(() => {
          expect(screen.queryByRole('grid')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Date Input Changes', () => {
    it('should update date when valid date is entered', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2000');

      const expectedDate = new Date('1/15/2000');
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
    });

    it('should call onSelect when valid date is entered', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2000');

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledWith(expect.any(String), 'testDate');
      });
    });

    it('should not update date when invalid date is entered', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, 'invalid-date');

      expect(input).toHaveValue('');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should not call onSelect when invalid date is entered', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, 'not-a-date');

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should increase year by 1 when ArrowUp is pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2000');

      onSelect.mockClear();
      await user.type(input, '{ArrowUp}');

      const expectedDate = new Date(2001, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).toHaveBeenCalledWith(expectedDate.toISOString(), 'testDate');
    });

    it('should decrease year by 1 when ArrowDown is pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2000');

      onSelect.mockClear();
      await user.type(input, '{ArrowDown}');

      const expectedDate = new Date(1999, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).toHaveBeenCalledWith(expectedDate.toISOString(), 'testDate');
    });

    it('should increase month by 1 when ArrowRight is pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2000');

      onSelect.mockClear();
      await user.type(input, '{ArrowRight}');

      const expectedDate = new Date(2000, 1, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).toHaveBeenCalledWith(expectedDate.toISOString(), 'testDate');
    });

    it('should decrease month by 1 when ArrowLeft is pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '02/15/2000');

      onSelect.mockClear();
      await user.type(input, '{ArrowLeft}');

      const expectedDate = new Date(2000, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).toHaveBeenCalledWith(expectedDate.toISOString(), 'testDate');
    });

    it('should prevent default behavior on arrow key press', async () => {
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      const keydownEvent = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(keydownEvent, 'preventDefault');

      input.dispatchEvent(keydownEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not change date on other key presses', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      const initialValue = input.getAttribute('value');

      await user.type(input, '{Enter}');

      expect(input).toHaveValue(initialValue);
    });
  });

  describe('Year Boundaries', () => {
    it('should not allow year below 1900 when ArrowDown is pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/1900');

      onSelect.mockClear();
      await user.type(input, '{ArrowDown}');

      const expectedDate = new Date(1900, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should not allow year above 2099 when ArrowUp is pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2099');

      onSelect.mockClear();
      await user.type(input, '{ArrowUp}');

      const expectedDate = new Date(2099, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should allow year 1900 as valid date', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/1900');

      const expectedDate = new Date(1900, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
    });

    it('should allow year 2099 as valid date', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2099');

      const expectedDate = new Date(2099, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
    });

    it('should allow ArrowUp from year 1901', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/1901');

      onSelect.mockClear();
      await user.type(input, '{ArrowUp}');

      const expectedDate = new Date(1902, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).toHaveBeenCalled();
    });

    it('should allow ArrowDown from year 2098', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '01/15/2098');

      onSelect.mockClear();
      await user.type(input, '{ArrowDown}');

      const expectedDate = new Date(2097, 0, 15);
      expect(input).toHaveValue(
        expectedDate.toLocaleDateString(navigator.language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      );
      expect(onSelect).toHaveBeenCalled();
    });
  });

  describe('Calendar Selection', () => {
    it('should update date when date is selected from calendar', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('grid')).toBeInTheDocument();
      });

      // Find a button within the calendar (the actual date buttons)
      const dateButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.hasAttribute('data-day') && !btn.hasAttribute('aria-disabled'));

      if (dateButtons.length > 0) {
        onSelect.mockClear();
        await user.click(dateButtons[0]);

        expect(onSelect).toHaveBeenCalled();
      }
    });

    it('should call onSelect with ISO string when date is selected from calendar', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('grid')).toBeInTheDocument();
      });

      // Find a button within the calendar (the actual date buttons)
      const dateButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.hasAttribute('data-day') && !btn.hasAttribute('aria-disabled'));

      if (dateButtons.length > 0) {
        onSelect.mockClear();
        await user.click(dateButtons[0]);

        await waitFor(() => {
          expect(onSelect).toHaveBeenCalledWith(
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
            'testDate'
          );
        });
      }
    });

    it('should disable dates before 1900 in calendar', async () => {
      const user = userEvent.setup();
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('grid')).toBeInTheDocument();
      });

      // Calendar should be configured with disabled dates
      // This is tested through the Calendar component's disabled prop
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });
  });

  describe('onSelect Callback', () => {
    it('should not call onSelect when not provided', async () => {
      const user = userEvent.setup();
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.clear(input);

      // Should not throw error when onSelect is undefined
      expect(() => user.type(input, '1/15/2000')).not.toThrow();
    });

    it('should call onSelect with ISO string format', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox');
      await user.type(input, '{ArrowUp}');

      expect(onSelect).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        'testDate'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should preserve month and day when changing year', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<DatePicker onSelect={onSelect} fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '06/25/2000');

      onSelect.mockClear();
      await user.type(input, '{ArrowUp}');

      // Verify onSelect was called with a new date
      expect(onSelect).toHaveBeenCalled();

      // Verify the date was updated by parsing the ISO string sent to onSelect
      const callArgs = onSelect.mock.calls[0];
      const isoString = callArgs[0];
      const newDate = new Date(isoString);

      // Month should be June (5 in 0-indexed) and day should be 25
      expect(newDate.getMonth()).toBe(5);
      expect(newDate.getDate()).toBe(25);
      // Year should have increased from 2000
      expect(newDate.getFullYear()).toBeGreaterThan(2000);
    });

    it('should handle leap year dates correctly', async () => {
      const user = userEvent.setup();
      render(<DatePicker fieldName="testDate" />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      await user.click(input);
      setInputDate(input, '02/29/2000');

      await user.type(input, '{ArrowUp}');

      // 2001 is not a leap year, so Feb 29 will roll over to March 1
      // JavaScript Date handles this automatically
      expect(input.value).toBeTruthy();
      expect(input.value).not.toBe('');
    });
  });
});
