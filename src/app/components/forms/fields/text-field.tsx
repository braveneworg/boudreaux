'use client';

import React, { useEffect } from 'react';
import { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';

interface TextFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  className?: string;
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  labelClassName?: string;
  placeholder: string;
  type?: 'text' | 'email' | 'tel';
  onUserInteraction?: () => void;
  value?: string;
  setValue?: UseFormSetValue<TFieldValues>;
}

export default function TextField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  className,
  control,
  name,
  label,
  labelClassName,
  placeholder,
  type = 'text',
  onUserInteraction,
  setValue,
  value = '',
}: TextFieldProps<TFieldValues, TName>) {
  useEffect(() => {
    if (setValue && value) {
      setValue(name, value as TFieldValues[TName], {
        shouldDirty: true,
        shouldValidate: false,
      });
    }
  }, [value, name, setValue]);

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
              onChange={(e) => {
                onUserInteraction?.();
                if (setValue) {
                  setValue(name, e.target.value as TFieldValues[TName], {
                    shouldDirty: true,
                    shouldValidate: true
                  });
                }
                field.onChange(e);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}