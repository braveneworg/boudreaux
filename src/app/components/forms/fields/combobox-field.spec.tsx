/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import ComboboxField from './combobox-field';

// Mock the UI components
vi.mock('@/app/components/ui/form', () => ({
  FormField: ({ name, render }: any) => {
    const field = {
      value: '',
      onChange: vi.fn(),
      onBlur: vi.fn(),
      name,
      ref: vi.fn()
    };
    return render({ field });
  },
  FormItem: ({ children }: { children: React.ReactNode }) => <div data-testid="form-item">{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label data-testid="form-label">{children}</label>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div data-testid="form-control">{children}</div>,
  FormMessage: () => <div data-testid="form-message" />,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({ children, role, ...props }: any) => (
    <button data-testid="combobox-trigger" role={role} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({ children, open }: any) => (
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
  Command: ({ children }: { children: React.ReactNode }) => <div data-testid="command">{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div data-testid="command-empty">{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div data-testid="command-group">{children}</div>,
  CommandInput: ({ placeholder, ...props }: any) => (
    <input data-testid="command-input" placeholder={placeholder} {...props} />
  ),
  CommandItem: ({ children, onSelect, value }: any) => (
    <button
      data-testid="command-item"
      data-value={value}
      onClick={() => onSelect?.(value)}
    >
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div data-testid="command-list">{children}</div>,
}));

vi.mock('lucide-react', () => ({
  Check: (props: any) => <span data-testid="check-icon" {...props}>✓</span>,
  ChevronsUpDown: (props: any) => <span data-testid="chevrons-icon" {...props}>↕</span>,
}));

// Test wrapper component that provides form context
function TestWrapper({ children, defaultValues = {} }: { children: React.ReactNode; defaultValues?: any }) {
  const methods = useForm({ defaultValues });
  return (
    <FormProvider {...methods}>
      {children}
    </FormProvider>
  );
}

describe('ComboboxField', () => {
  const defaultOptions = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3', searchValue: 'third option' },
  ];

  const defaultProps = {
    control: {} as any,
    name: 'testCombobox' as any,
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
});