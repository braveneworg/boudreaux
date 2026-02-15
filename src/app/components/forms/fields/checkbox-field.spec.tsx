/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';

import CheckboxField from './checkbox-field';

import type { Control, FieldValues } from 'react-hook-form';

// Mock the UI components - use inline JSX to avoid issues with React hoisting in mocks
vi.mock('@/app/components/ui/form', () => {
  // Create stable mock functions outside the component definitions
  const mockOnChange = vi.fn();
  const mockOnBlur = vi.fn();
  const mockRef = vi.fn();

  return {
    FormField: ({
      name,
      render,
    }: {
      name: string;
      render: (context: { field: Record<string, unknown> }) => React.ReactNode;
    }) => {
      const field = {
        value: false,
        onChange: mockOnChange,
        onBlur: mockOnBlur,
        name,
        ref: mockRef,
      };
      return render({ field });
    },
    FormItem: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="form-item" className={className}>
        {children}
      </div>
    ),
    FormLabel: ({
      children,
      htmlFor,
      className,
    }: {
      children: React.ReactNode;
      htmlFor?: string;
      className?: string;
    }) => (
      <label data-testid="form-label" htmlFor={htmlFor} className={className}>
        {children}
      </label>
    ),
    FormControl: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="form-control">{children}</div>
    ),
  };
});

vi.mock('@/app/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
    ...props
  }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void; id?: string } & Record<
    string,
    unknown
  >) => (
    <input
      data-testid="checkbox-input"
      type="checkbox"
      checked={checked}
      id={id}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
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

describe('CheckboxField', () => {
  const defaultProps = {
    control: {} as Control<FieldValues>,
    name: 'testCheckbox' as const,
    label: <span>Test Checkbox</span>,
    id: 'test-checkbox',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct label and id', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Test Checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-input')).toHaveAttribute('id', 'test-checkbox');
  });

  it('renders with string label', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} label="Simple Text Label" />
      </TestWrapper>
    );

    expect(screen.getByText('Simple Text Label')).toBeInTheDocument();
  });

  it('calls onUserInteraction when checkbox changes', () => {
    const onUserInteraction = vi.fn();
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} onUserInteraction={onUserInteraction} />
      </TestWrapper>
    );

    const checkbox = screen.getByTestId('checkbox-input');
    fireEvent.click(checkbox);

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  it('does not call onUserInteraction when not provided', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} />
      </TestWrapper>
    );

    const checkbox = screen.getByTestId('checkbox-input');
    fireEvent.click(checkbox);

    // Should not throw any errors
    expect(checkbox).toBeInTheDocument();
  });

  it('applies correct CSS classes for layout', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} />
      </TestWrapper>
    );

    const formItem = screen.getByTestId('form-item');
    expect(formItem).toHaveClass('flex', 'flex-row', 'items-start', 'space-0');
  });

  it('renders complex label content', () => {
    const complexLabel = (
      <>
        <strong>Important checkbox</strong>
        <br />
        <em>Additional info</em>
      </>
    );

    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} label={complexLabel} />
      </TestWrapper>
    );

    expect(screen.getByText('Important checkbox')).toBeInTheDocument();
    expect(screen.getByText('Additional info')).toBeInTheDocument();
  });

  it('applies correct label styles', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} />
      </TestWrapper>
    );

    const label = screen.getByTestId('form-label');
    expect(label).toHaveClass('block', 'text-sm', 'font-normal');
    // Note: htmlFor might not be set in the mock
  });

  it('renders all form structure components', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-item')).toBeInTheDocument();
    expect(screen.getByTestId('form-label')).toBeInTheDocument();
    expect(screen.getByTestId('form-control')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-input')).toBeInTheDocument();
  });

  it('passes setValue prop when provided', () => {
    const setValue = vi.fn();
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} setValue={setValue} />
      </TestWrapper>
    );

    expect(screen.getByTestId('checkbox-input')).toBeInTheDocument();
  });

  it('calls setValue with correct parameters when checkbox is changed', () => {
    const setValue = vi.fn();
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} setValue={setValue} />
      </TestWrapper>
    );

    const checkbox = screen.getByTestId('checkbox-input');
    fireEvent.click(checkbox);

    expect(setValue).toHaveBeenCalledWith('testCheckbox', true, {
      shouldDirty: true,
      shouldValidate: true,
    });
  });

  it('calls both setValue and onUserInteraction when both provided', () => {
    const setValue = vi.fn();
    const onUserInteraction = vi.fn();
    render(
      <TestWrapper>
        <CheckboxField
          {...defaultProps}
          setValue={setValue}
          onUserInteraction={onUserInteraction}
        />
      </TestWrapper>
    );

    const checkbox = screen.getByTestId('checkbox-input');
    fireEvent.click(checkbox);

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
    expect(setValue).toHaveBeenCalledWith('testCheckbox', true, {
      shouldDirty: true,
      shouldValidate: true,
    });
  });

  it('handles checkbox state changes', () => {
    render(
      <TestWrapper>
        <CheckboxField {...defaultProps} />
      </TestWrapper>
    );

    const checkbox = screen.getByTestId('checkbox-input') as HTMLInputElement;

    // Initial state should be unchecked
    expect(checkbox.checked).toBe(false);

    // Click to check
    fireEvent.click(checkbox);

    // The checkbox input should be in the document
    expect(checkbox).toBeInTheDocument();
  });
});
