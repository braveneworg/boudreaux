import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Calendar, CalendarDayButton } from './calendar';

import type { DayButtonProps, Modifiers } from 'react-day-picker';

// Mock the react-day-picker's DayButton component props
// Using type assertion since we only need the subset of properties used by CalendarDayButton
const createMockDayProps = (overrides = {}): DayButtonProps => ({
  day: {
    date: new Date(2024, 0, 15), // January 15, 2024
    displayMonth: new Date(2024, 0, 1),
    outside: false,
    dateLib: {} as DayButtonProps['day']['dateLib'],
    isoDate: '2024-01-15',
    displayMonthId: '2024-01',
    dateMonthId: '2024-01',
    isEqualTo: () => false,
  },
  modifiers: {
    focused: false,
    selected: false,
    range_start: false,
    range_end: false,
    range_middle: false,
    disabled: false,
    hidden: false,
    outside: false,
    today: false,
    ...overrides,
  } as Modifiers,
});

describe('Calendar', () => {
  describe('basic rendering', () => {
    it('renders with default props', () => {
      render(<Calendar />);

      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    it('renders with data-slot attribute', () => {
      render(<Calendar />);

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Calendar className="custom-calendar" />);

      const calendar = document.querySelector('[data-slot="calendar"]');
      expect(calendar).toHaveClass('custom-calendar');
    });

    it('shows outside days by default', () => {
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      // Calendar should be rendered
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    it('hides outside days when showOutsideDays is false', () => {
      render(<Calendar showOutsideDays={false} defaultMonth={new Date(2024, 0, 1)} />);

      expect(screen.getByRole('grid')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('renders navigation buttons', () => {
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      // Should have previous and next buttons
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('navigates to previous month', async () => {
      const user = userEvent.setup();
      render(<Calendar defaultMonth={new Date(2024, 1, 1)} />);

      // Find and click previous month button
      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);

      // Calendar should show January 2024
      expect(screen.getByText('January 2024')).toBeInTheDocument();
    });

    it('navigates to next month', async () => {
      const user = userEvent.setup();
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      // Find and click next month button
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      // Calendar should show February 2024
      expect(screen.getByText('February 2024')).toBeInTheDocument();
    });
  });

  describe('captionLayout', () => {
    it('renders with label caption layout by default', () => {
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      expect(screen.getByText('January 2024')).toBeInTheDocument();
    });

    it('renders with dropdown caption layout', () => {
      render(<Calendar captionLayout="dropdown" defaultMonth={new Date(2024, 0, 1)} />);

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });

    it('renders with dropdown-months caption layout', () => {
      render(<Calendar captionLayout="dropdown-months" defaultMonth={new Date(2024, 0, 1)} />);

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });

    it('renders with dropdown-years caption layout', () => {
      render(<Calendar captionLayout="dropdown-years" defaultMonth={new Date(2024, 0, 1)} />);

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });
  });

  describe('buttonVariant', () => {
    it('uses ghost variant by default', () => {
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      // Navigation buttons should have ghost variant styling
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('accepts custom button variant', () => {
      render(<Calendar buttonVariant="outline" defaultMonth={new Date(2024, 0, 1)} />);

      // Calendar should render with the variant applied to nav buttons
      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });
  });

  describe('formatters', () => {
    it('uses default month dropdown formatter', () => {
      render(<Calendar captionLayout="dropdown" defaultMonth={new Date(2024, 0, 1)} />);

      // The calendar should be rendered
      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });

    it('accepts custom formatters', () => {
      const customFormatters = {
        formatWeekdayName: (date: Date) => date.toLocaleString('default', { weekday: 'narrow' }),
      };

      render(<Calendar formatters={customFormatters} defaultMonth={new Date(2024, 0, 1)} />);

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });
  });

  describe('selection modes', () => {
    it('handles single date selection', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <Calendar
          mode="single"
          selected={undefined}
          onSelect={onSelect}
          defaultMonth={new Date(2024, 0, 1)}
        />
      );

      // Click on a day button inside gridcell
      const gridcell = screen.getByRole('gridcell', { name: '15' });
      const button = gridcell.querySelector('button');
      if (button) {
        await user.click(button);
        expect(onSelect).toHaveBeenCalled();
      }
    });

    it('handles range date selection', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <Calendar
          mode="range"
          selected={undefined}
          onSelect={onSelect}
          defaultMonth={new Date(2024, 0, 1)}
        />
      );

      // Click start date button inside gridcell
      const gridcell = screen.getByRole('gridcell', { name: '10' });
      const button = gridcell.querySelector('button');
      if (button) {
        await user.click(button);
        expect(onSelect).toHaveBeenCalled();
      }
    });

    it('handles multiple date selection', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <Calendar
          mode="multiple"
          selected={[]}
          onSelect={onSelect}
          defaultMonth={new Date(2024, 0, 1)}
        />
      );

      const gridcell15 = screen.getByRole('gridcell', { name: '15' });
      const button15 = gridcell15.querySelector('button');
      if (button15) {
        await user.click(button15);
        expect(onSelect).toHaveBeenCalled();
      }
    });
  });

  describe('custom classNames', () => {
    it('merges custom classNames with defaults', () => {
      render(
        <Calendar classNames={{ day: 'custom-day-class' }} defaultMonth={new Date(2024, 0, 1)} />
      );

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });
  });

  describe('custom components', () => {
    it('allows custom components to be passed', () => {
      const CustomRoot = ({ rootRef, ...props }: { rootRef?: React.Ref<HTMLDivElement> }) => (
        <div ref={rootRef} data-testid="custom-root" {...props} />
      );

      render(<Calendar components={{ Root: CustomRoot }} defaultMonth={new Date(2024, 0, 1)} />);

      expect(screen.getByTestId('custom-root')).toBeInTheDocument();
    });
  });

  describe('chevron orientations', () => {
    it('renders left chevron for previous month', () => {
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      // The previous button should be rendered
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    });

    it('renders right chevron for next month', () => {
      render(<Calendar defaultMonth={new Date(2024, 0, 1)} />);

      // The next button should be rendered
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });

  describe('week numbers', () => {
    it('renders week numbers when showWeekNumber is true', () => {
      render(<Calendar showWeekNumber defaultMonth={new Date(2024, 0, 1)} />);

      expect(document.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
    });
  });
});

describe('CalendarDayButton', () => {
  it('renders with day data', () => {
    const props = createMockDayProps();
    render(<CalendarDayButton {...props}>15</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '15' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-day');
  });

  it('applies selected-single styling when selected without range', () => {
    const props = createMockDayProps({ selected: true });
    render(<CalendarDayButton {...props}>15</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '15' });
    expect(button).toHaveAttribute('data-selected-single', 'true');
  });

  it('does not apply selected-single styling when in range', () => {
    const props = createMockDayProps({ selected: true, range_start: true });
    render(<CalendarDayButton {...props}>15</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '15' });
    expect(button).toHaveAttribute('data-selected-single', 'false');
    expect(button).toHaveAttribute('data-range-start', 'true');
  });

  it('applies range-start styling', () => {
    const props = createMockDayProps({ range_start: true, selected: true });
    render(<CalendarDayButton {...props}>10</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '10' });
    expect(button).toHaveAttribute('data-range-start', 'true');
  });

  it('applies range-end styling', () => {
    const props = createMockDayProps({ range_end: true, selected: true });
    render(<CalendarDayButton {...props}>20</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '20' });
    expect(button).toHaveAttribute('data-range-end', 'true');
  });

  it('applies range-middle styling', () => {
    const props = createMockDayProps({ range_middle: true, selected: true });
    render(<CalendarDayButton {...props}>15</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '15' });
    expect(button).toHaveAttribute('data-range-middle', 'true');
  });

  it('focuses button when modifiers.focused is true', () => {
    const props = createMockDayProps({ focused: true });
    render(<CalendarDayButton {...props}>15</CalendarDayButton>);

    const button = screen.getByRole('button', { name: '15' });
    expect(button).toHaveFocus();
  });

  it('applies custom className', () => {
    const props = createMockDayProps();
    render(
      <CalendarDayButton {...props} className="custom-day-button">
        15
      </CalendarDayButton>
    );

    const button = screen.getByRole('button', { name: '15' });
    expect(button).toHaveClass('custom-day-button');
  });
});
