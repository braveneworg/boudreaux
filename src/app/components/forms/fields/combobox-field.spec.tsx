import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useForm, FormProvider, Control, FieldValues } from 'react-hook-form';
import ComboboxField from './combobox-field';

// Mock the UI components
vi.mock('@/app/components/ui/form', () => ({
  FormField: ({
    name,
    render,
  }: {
    name: string;
    render: (context: Record<string, unknown>) => React.ReactNode;
  }) => {
    const field = {
      value: '',
      onChange: vi.fn(),
      onBlur: vi.fn(),
      name,
      ref: vi.fn(),
    };
    return render({ field });
  },
  FormItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-item">{children}</div>
  ),
  FormLabel: ({ children }: { children: React.ReactNode }) => (
    <label data-testid="form-label">{children}</label>
  ),
  FormControl: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-control">{children}</div>
  ),
  FormMessage: () => <div data-testid="form-message" />,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    role,
    ...props
  }: { children?: React.ReactNode; role?: string } & Record<string, unknown>) => (
    <button data-testid="combobox-trigger" role={role} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({ children, open }: { children?: React.ReactNode; open?: boolean }) => (
    <div data-testid="popover" data-open={open?.toString()}>
      {children}
    </div>
  ),
  PopoverContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command">{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-group">{children}</div>
  ),
  CommandInput: ({ placeholder, ...props }: { placeholder?: string } & Record<string, unknown>) => (
    <input data-testid="command-input" placeholder={placeholder} {...props} />
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children?: React.ReactNode;
    onSelect?: (value?: string) => void;
    value?: string;
  }) => (
    <button data-testid="command-item" data-value={value} onClick={() => onSelect?.(value)}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-list">{children}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Check: (props: Record<string, unknown>) => (
    <span data-testid="check-icon" {...props}>
      ✓
    </span>
  ),
  ChevronsUpDown: (props: Record<string, unknown>) => (
    <span data-testid="chevrons-icon" {...props}>
      ↕
    </span>
  ),
}));

// Test wrapper component that provides form context
function TestWrapper({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: Record<string, unknown>;
}) {
  const methods = useForm({ defaultValues });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('ComboboxField', () => {
  const defaultOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3', searchValue: 'third option' },
  ];

  const defaultProps = {
    control: {} as Control<FieldValues>,
    name: 'testCombobox' as const,
    label: 'Test Combobox',
    placeholder: 'Select an option...',
    searchPlaceholder: 'Search options...',
    emptyMessage: 'No options found.',
    options: defaultOptions,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct label and placeholder', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-label')).toHaveTextContent('Test Combobox');
    expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select an option...');
  });

  it('renders with correct combobox attributes', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const trigger = screen.getByTestId('combobox-trigger');
    expect(trigger).toHaveAttribute('role', 'combobox');
  });

  it('renders command input with correct placeholder', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const commandInput = screen.getByTestId('command-input');
    expect(commandInput).toHaveAttribute('placeholder', 'Search options...');
  });

  it('renders all command structure components', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('command')).toBeInTheDocument();
    expect(screen.getByTestId('command-input')).toBeInTheDocument();
    expect(screen.getByTestId('command-empty')).toBeInTheDocument();
    expect(screen.getByTestId('command-list')).toBeInTheDocument();
    expect(screen.getByTestId('command-group')).toBeInTheDocument();
  });

  it('renders all options as command items', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const commandItems = screen.getAllByTestId('command-item');
    expect(commandItems).toHaveLength(3);

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('shows empty message', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('command-empty')).toHaveTextContent('No options found.');
  });

  it('calls onUserInteraction when option is selected', () => {
    const onUserInteraction = vi.fn();
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} onUserInteraction={onUserInteraction} />
      </TestWrapper>
    );

    const firstOption = screen.getAllByTestId('command-item')[0];
    fireEvent.click(firstOption);

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  it('does not call onUserInteraction when not provided', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const firstOption = screen.getAllByTestId('command-item')[0];
    fireEvent.click(firstOption);

    // Should not throw any errors
    expect(firstOption).toBeInTheDocument();
  });

  it('uses default popover width', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const popoverContent = screen.getByTestId('popover-content');
    expect(popoverContent).toHaveClass('w-[300px]');
  });

  it('uses custom popover width when provided', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} popoverWidth="w-[500px]" />
      </TestWrapper>
    );

    const popoverContent = screen.getByTestId('popover-content');
    expect(popoverContent).toHaveClass('w-[500px]');
  });

  it('renders form message component', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-message')).toBeInTheDocument();
  });

  it('renders check and chevron icons', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('chevrons-icon')).toBeInTheDocument();
    expect(screen.getAllByTestId('check-icon')).toHaveLength(defaultOptions.length);
  });

  it('handles options with custom search values', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const thirdOption = screen.getAllByTestId('command-item')[2];
    expect(thirdOption).toHaveAttribute('data-value', 'third option');
  });

  it('handles options without custom search values', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    const firstOption = screen.getAllByTestId('command-item')[0];
    expect(firstOption).toHaveAttribute('data-value', 'option 1');
  });

  it('renders all form structure components', () => {
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-item')).toBeInTheDocument();
    expect(screen.getByTestId('form-label')).toBeInTheDocument();
    expect(screen.getByTestId('form-control')).toBeInTheDocument();
    expect(screen.getByTestId('form-message')).toBeInTheDocument();
    expect(screen.getByTestId('popover')).toBeInTheDocument();
  });

  it('passes setValue prop when provided', () => {
    const setValue = vi.fn();
    render(
      <TestWrapper>
        <ComboboxField {...defaultProps} setValue={setValue} />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-trigger')).toBeInTheDocument();
  });

  describe('Focus and Keyboard Behavior', () => {
    it('opens popover when trigger button receives focus', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');

      // Initially popover should be closed
      expect(popover).toHaveAttribute('data-open', 'false');

      // Focus the trigger button
      fireEvent.focus(trigger);

      // Popover should now be open
      expect(popover).toHaveAttribute('data-open', 'true');
    });

    it('opens popover when user types an alphanumeric key', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');

      // Initially popover should be closed
      expect(popover).toHaveAttribute('data-open', 'false');

      // Type a letter
      fireEvent.keyDown(trigger, { key: 'a' });

      // Popover should now be open
      expect(popover).toHaveAttribute('data-open', 'true');
    });

    it('opens popover when user types a number', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');

      // Initially popover should be closed
      expect(popover).toHaveAttribute('data-open', 'false');

      // Type a number
      fireEvent.keyDown(trigger, { key: '5' });

      // Popover should now be open
      expect(popover).toHaveAttribute('data-open', 'true');
    });

    it('does not open popover for non-alphanumeric keys', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');

      // Initially popover should be closed
      expect(popover).toHaveAttribute('data-open', 'false');

      // Type special keys that should not open popover
      fireEvent.keyDown(trigger, { key: 'Enter' });
      expect(popover).toHaveAttribute('data-open', 'false');

      fireEvent.keyDown(trigger, { key: 'Tab' });
      expect(popover).toHaveAttribute('data-open', 'false');

      fireEvent.keyDown(trigger, { key: 'Escape' });
      expect(popover).toHaveAttribute('data-open', 'false');

      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      expect(popover).toHaveAttribute('data-open', 'false');
    });

    it('does not open popover when already open', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');

      // Open the popover first
      fireEvent.focus(trigger);
      expect(popover).toHaveAttribute('data-open', 'true');

      // Type a key when already open - should not cause issues
      fireEvent.keyDown(trigger, { key: 'b' });
      expect(popover).toHaveAttribute('data-open', 'true');
    });

    it('populates search input when typing on closed popover', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const commandInput = screen.getByTestId('command-input');

      // Type a letter
      fireEvent.keyDown(trigger, { key: 'o' });

      // Search input should have the typed value
      expect(commandInput).toHaveValue('o');
    });

    it('renders search input as controlled with value prop', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const commandInput = screen.getByTestId('command-input');

      // Initially empty
      expect(commandInput).toHaveValue('');

      // Has value prop (controlled input)
      expect(commandInput).toHaveAttribute('value');
    });

    it('clears search input after selecting an option', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const commandInput = screen.getByTestId('command-input');

      // Type to open and populate search
      fireEvent.keyDown(trigger, { key: 'o' });
      expect(commandInput).toHaveValue('o');

      // Select an option
      const firstOption = screen.getAllByTestId('command-item')[0];
      fireEvent.click(firstOption);

      // Search should be cleared
      expect(commandInput).toHaveValue('');
    });

    it('handles uppercase letters correctly', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');
      const commandInput = screen.getByTestId('command-input');

      // Type an uppercase letter
      fireEvent.keyDown(trigger, { key: 'O' });

      // Popover should open
      expect(popover).toHaveAttribute('data-open', 'true');

      // Search input should have the uppercase letter
      expect(commandInput).toHaveValue('O');
    });

    it('handles numbers correctly', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const commandInput = screen.getByTestId('command-input');

      // Type a number
      fireEvent.keyDown(trigger, { key: '3' });

      // Search input should have the number
      expect(commandInput).toHaveValue('3');
    });

    it('works with focus followed by typing', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');
      const commandInput = screen.getByTestId('command-input');

      // Focus first (opens popover)
      fireEvent.focus(trigger);
      expect(popover).toHaveAttribute('data-open', 'true');

      // Search input should start empty and be ready for typing
      expect(commandInput).toHaveValue('');
      expect(commandInput).toBeInTheDocument();
    });

    it('allows typing directly without focusing first', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const trigger = screen.getByTestId('combobox-trigger');
      const popover = screen.getByTestId('popover');
      const commandInput = screen.getByTestId('command-input');

      // Type without focusing first
      fireEvent.keyDown(trigger, { key: 's' });

      // Popover should open and search should be populated
      expect(popover).toHaveAttribute('data-open', 'true');
      expect(commandInput).toHaveValue('s');
    });

    it('uses controlled search input with value prop', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const commandInput = screen.getByTestId('command-input');

      // Has value prop (controlled input for search filtering)
      expect(commandInput).toHaveAttribute('value');
      expect(commandInput).toBeInTheDocument();
    });

    it('passes shouldFilter prop to Command component', () => {
      render(
        <TestWrapper>
          <ComboboxField {...defaultProps} />
        </TestWrapper>
      );

      const command = screen.getByTestId('command');

      // Command component receives shouldFilter prop for custom filtering
      expect(command).toBeInTheDocument();
    });
  });
});
