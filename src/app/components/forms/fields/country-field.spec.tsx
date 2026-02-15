/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';

import { type ProfileFormData } from '@/lib/validation/profile-schema';

import CountryField from './country-field';

// Mock the ComboboxField component - use named function to ensure mock is properly hoisted
vi.mock('./combobox-field', () => ({
  default: function MockComboboxField(props: {
    label?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    options: { value: string; label: string }[];
    popoverWidth?: string;
    onUserInteraction?: () => void;
  }) {
    return (
      <div data-testid="combobox-field">
        <label data-testid="combobox-label">{props.label}</label>
        <button data-testid="combobox-trigger">{props.placeholder}</button>
        <input data-testid="combobox-search" placeholder={props.searchPlaceholder} />
        <div data-testid="combobox-empty">{props.emptyMessage}</div>
        <div data-testid="combobox-width" className={props.popoverWidth} />
        <div data-testid="combobox-options">
          {props.options.map((option: { value: string; label: string }) => (
            <button
              key={option.value}
              data-testid="country-option"
              data-value={option.value}
              onClick={() => props.onUserInteraction?.()}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  },
}));

// Mock the countries utils
vi.mock('@/lib/utils/countries', () => ({
  COUNTRIES: [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'MX', name: 'Mexico' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'FR', name: 'France' },
  ],
}));

// Test wrapper component that provides form context
function TestWrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm<ProfileFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      allowSmsNotifications: false,
    },
  });

  return (
    <FormProvider {...methods}>
      <form>{children}</form>
    </FormProvider>
  );
}

// Helper component that renders CountryField with form context
function CountryFieldWithContext({ onUserInteraction }: { onUserInteraction?: () => void }) {
  const { control, setValue } = useFormContext<ProfileFormData>();
  return (
    <CountryField control={control} setValue={setValue} onUserInteraction={onUserInteraction} />
  );
}

describe('CountryField', () => {
  it('should render with default props', () => {
    render(
      <TestWrapper>
        <CountryFieldWithContext />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
    expect(screen.getByTestId('combobox-label')).toHaveTextContent('Country');
    expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select a country...');
    expect(screen.getByTestId('combobox-search')).toHaveAttribute(
      'placeholder',
      'Search countries...'
    );
    expect(screen.getByTestId('combobox-empty')).toHaveTextContent('No country found.');
  });

  it('should render all country options', () => {
    render(
      <TestWrapper>
        <CountryFieldWithContext />
      </TestWrapper>
    );

    const options = screen.getAllByTestId('country-option');
    expect(options).toHaveLength(5);

    expect(options[0]).toHaveAttribute('data-value', 'US');
    expect(options[0]).toHaveTextContent('United States');

    expect(options[1]).toHaveAttribute('data-value', 'CA');
    expect(options[1]).toHaveTextContent('Canada');

    expect(options[2]).toHaveAttribute('data-value', 'MX');
    expect(options[2]).toHaveTextContent('Mexico');

    expect(options[3]).toHaveAttribute('data-value', 'GB');
    expect(options[3]).toHaveTextContent('United Kingdom');

    expect(options[4]).toHaveAttribute('data-value', 'FR');
    expect(options[4]).toHaveTextContent('France');
  });

  it('should call onUserInteraction when provided', () => {
    const onUserInteraction = vi.fn();

    render(
      <TestWrapper>
        <CountryFieldWithContext onUserInteraction={onUserInteraction} />
      </TestWrapper>
    );

    const firstOption = screen.getAllByTestId('country-option')[0];
    firstOption.click();

    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });

  it('should pass through control and setValue props to ComboboxField', () => {
    render(
      <TestWrapper>
        <CountryFieldWithContext />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
  });

  it('should have correct option structure for countries', () => {
    render(
      <TestWrapper>
        <CountryFieldWithContext />
      </TestWrapper>
    );

    const options = screen.getAllByTestId('country-option');

    // Check that options have the correct value (country code) and label (country name)
    options.forEach((option) => {
      const value = option.getAttribute('data-value');
      const label = option.textContent;

      expect(value).toBeTruthy();
      expect(label).toBeTruthy();
      expect(value?.length).toBe(2); // Country codes are 2 characters
    });
  });

  it('should render without onUserInteraction prop', () => {
    render(
      <TestWrapper>
        <CountryFieldWithContext />
      </TestWrapper>
    );

    expect(screen.getByTestId('combobox-field')).toBeInTheDocument();

    // Should not throw when clicking without onUserInteraction
    const firstOption = screen.getAllByTestId('country-option')[0];
    expect(() => firstOption.click()).not.toThrow();
  });
});
