import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';

import TextField from './text-field';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

// Mock the UI components
vi.mock('@/app/components/ui/form', () => ({
  FormField: ({
    name,
    render,
  }: {
    name: string;
    render: (context: { field: Record<string, unknown> }) => React.ReactNode;
  }) => {
    // Simple mock that calls render with a basic field object
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

vi.mock('@/app/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => <input data-testid="text-input" {...props} />,
}));

// Test wrapper component that provides form context
function TestWrapper({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: FieldValues;
}) {
  const methods = useForm({ defaultValues });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('TextField', () => {
  const defaultProps = {
    control: {} as Control<FieldValues>,
    name: 'testField' as FieldPath<FieldValues>,
    label: 'Test Field',
    placeholder: 'Enter test value',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct label and placeholder', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-label')).toHaveTextContent('Test Field');
    expect(screen.getByTestId('text-input')).toHaveAttribute('placeholder', 'Enter test value');
  });

  it('renders with default text input type', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} />
      </TestWrapper>
    );

    const input = screen.getByTestId('text-input');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('renders with specified input type', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} type="email" />
      </TestWrapper>
    );

    const input = screen.getByTestId('text-input');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('renders with tel input type', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} type="tel" />
      </TestWrapper>
    );

    const input = screen.getByTestId('text-input');
    expect(input).toHaveAttribute('type', 'tel');
  });

  it('calls onUserInteraction when input changes', () => {
    const onUserInteraction = vi.fn();
    render(
      <TestWrapper>
        <TextField {...defaultProps} onUserInteraction={onUserInteraction} />
      </TestWrapper>
    );

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'test value' } });

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  it('does not call onUserInteraction when not provided', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} />
      </TestWrapper>
    );

    const input = screen.getByTestId('text-input');
    fireEvent.change(input, { target: { value: 'test value' } });

    // Should not throw any errors
    expect(input).toBeInTheDocument();
  });

  it('renders all form structure components', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-item')).toBeInTheDocument();
    expect(screen.getByTestId('form-label')).toBeInTheDocument();
    expect(screen.getByTestId('form-control')).toBeInTheDocument();
    expect(screen.getByTestId('form-message')).toBeInTheDocument();
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
  });

  it('passes setValue prop when provided', () => {
    const setValue = vi.fn();
    render(
      <TestWrapper>
        <TextField {...defaultProps} setValue={setValue} />
      </TestWrapper>
    );

    // The component should render without errors when setValue is provided
    expect(screen.getByTestId('text-input')).toBeInTheDocument();
  });

  it('handles different field names', () => {
    render(
      <TestWrapper>
        <TextField {...defaultProps} name="firstName" />
      </TestWrapper>
    );

    expect(screen.getByTestId('text-input')).toBeInTheDocument();
  });
});
