/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';

import { SwitchField } from './switch-field';

import type { Control, FieldValues } from 'react-hook-form';

vi.mock('@/app/components/ui/form', () => {
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

vi.mock('@/app/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    id,
    ...props
  }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void; id?: string } & Record<
    string,
    unknown
  >) => (
    <input
      data-testid="switch-input"
      type="checkbox"
      role="switch"
      checked={checked}
      id={id}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  ),
}));

const TestWrapper = ({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: Record<string, unknown>;
}) => {
  const methods = useForm({ defaultValues });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

describe('SwitchField', () => {
  const defaultProps = {
    control: {} as Control<FieldValues>,
    name: 'testSwitch' as const,
    label: <span>Test Switch</span>,
    id: 'test-switch',
  };

  it('renders with correct label and id', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Test Switch')).toBeInTheDocument();
    expect(screen.getByTestId('switch-input')).toHaveAttribute('id', 'test-switch');
  });

  it('renders as a switch role', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('renders with string label', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} label="Simple Text Label" />
      </TestWrapper>
    );

    expect(screen.getByText('Simple Text Label')).toBeInTheDocument();
  });

  it('calls onUserInteraction when toggled', () => {
    const onUserInteraction = vi.fn();
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} onUserInteraction={onUserInteraction} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByTestId('switch-input'));

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onUserInteraction is not provided', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} />
      </TestWrapper>
    );

    const toggle = screen.getByTestId('switch-input');
    fireEvent.click(toggle);

    expect(toggle).toBeInTheDocument();
  });

  it('uses a row layout for label + control', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-item')).toHaveClass('flex', 'flex-row', 'items-center');
  });

  it('applies a cursor-pointer label for the tap target', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-label')).toHaveClass('cursor-pointer');
  });
  it('renders all form structure components', () => {
    render(
      <TestWrapper>
        <SwitchField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('form-item')).toBeInTheDocument();
    expect(screen.getByTestId('form-label')).toBeInTheDocument();
    expect(screen.getByTestId('form-control')).toBeInTheDocument();
    expect(screen.getByTestId('switch-input')).toBeInTheDocument();
  });
});
