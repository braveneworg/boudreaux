/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React from 'react';

import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';

import { useFieldValidator } from './use-field-validator';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';

interface TextFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  className?: string;
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  labelClassName?: string;
  placeholder: string;
  type?: 'text' | 'email' | 'tel';
  onUserInteraction?: () => void;
  /**
   * Report validation errors while the user types rather than waiting for the
   * first submit. See {@link useFieldValidator}.
   */
  validateOnChange?: boolean;
  disabled?: boolean;
}

export const TextField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  className,
  control,
  name,
  label,
  labelClassName,
  placeholder,
  type = 'text',
  onUserInteraction,
  validateOnChange,
  disabled = false,
}: TextFieldProps<TFieldValues, TName>) => {
  const validateField = useFieldValidator<TFieldValues>(name, validateOnChange);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={labelClassName}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              placeholder={placeholder}
              type={type}
              disabled={disabled}
              onChange={(e) => {
                onUserInteraction?.();
                field.onChange(e);
                validateField();
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
