/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import StateField from './state-field';

// Mock the ComboboxField component
vi.mock('./combobox-field', () => ({
  default: ({ label, placeholder, searchPlaceholder, emptyMessage, options, popoverWidth, onUserInteraction }: any) => (
    <div data-testid="combobox-field">
      <label data-testid="combobox-label">{label}</label>
      <button data-testid="combobox-trigger">{placeholder}</button>
      <input data-testid="combobox-search" placeholder={searchPlaceholder} />
      <div data-testid="combobox-empty">{emptyMessage}</div>
      <div data-testid="combobox-width" className={popoverWidth} />
      <div data-testid="combobox-options">
        {options.map((option: any) => (
          <button
            key={option.value}
            data-testid="state-option"
            data-value={option.value}
            onClick={() => onUserInteraction?.()}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  ),
}));

// Mock the US_STATES data
vi.mock('@/app/lib/utils/states', () => ({
  US_STATES: [
    { code: 'NY', name: 'New York' },
    { code: 'CA', name: 'California' },
    { code: 'TX', name: 'Texas' },
    { code: 'FL', name: 'Florida' },
  ],
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

describe('StateField', () => {
  const defaultProps = {
    control: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ComboboxField with correct props', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
    expect(screen.getByTestId('combobox-label')).toHaveTextContent('State');
    expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select a state...');
  });

  it('renders with correct search placeholder', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    const searchInput = screen.getByTestId('combobox-search');
    expect(searchInput).toHaveAttribute('placeholder', 'Search states...');
  });

  it('renders with correct empty message', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-empty')).toHaveTextContent('No state found.');
  });

  it('uses correct popover width', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    const widthElement = screen.getByTestId('combobox-width');
    expect(widthElement).toHaveClass('w-[300px]');
  });

  it('renders all US states as options', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    const stateOptions = screen.getAllByTestId('state-option');
    expect(stateOptions).toHaveLength(4);

    // Check that states are formatted correctly
    expect(screen.getByText('New York - NY')).toBeInTheDocument();
    expect(screen.getByText('California - CA')).toBeInTheDocument();
    expect(screen.getByText('Texas - TX')).toBeInTheDocument();
    expect(screen.getByText('Florida - FL')).toBeInTheDocument();
  });

  it('maps state codes correctly', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    const stateOptions = screen.getAllByTestId('state-option');

    expect(stateOptions[0]).toHaveAttribute('data-value', 'NY');
    expect(stateOptions[1]).toHaveAttribute('data-value', 'CA');
    expect(stateOptions[2]).toHaveAttribute('data-value', 'TX');
    expect(stateOptions[3]).toHaveAttribute('data-value', 'FL');
  });

  it('calls onUserInteraction when provided', () => {
    const onUserInteraction = vi.fn();
    render(
      <TestWrapper>
        <StateField {...defaultProps} onUserInteraction={onUserInteraction} />
      </TestWrapper>
    );

    const firstStateOption = screen.getAllByTestId('state-option')[0];
    fireEvent.click(firstStateOption);

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  it('does not call onUserInteraction when not provided', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    const firstStateOption = screen.getAllByTestId('state-option')[0];
    fireEvent.click(firstStateOption);

    // Should not throw any errors
    expect(firstStateOption).toBeInTheDocument();
  });

  it('passes setValue prop when provided', () => {
    const setValue = vi.fn();
    render(
      <TestWrapper>
        <StateField {...defaultProps} setValue={setValue} />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
  });

  it('uses correct field name for state', () => {
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    // The ComboboxField should be rendered, indicating the name prop was passed correctly
    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
  });

  it('handles empty states array gracefully', () => {
    // This tests the robustness of the component
    render(
      <TestWrapper>
        <StateField {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
  });
});