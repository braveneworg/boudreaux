'use client';

import React from 'react';
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
}: TextFieldProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={labelClassName}>{label}</FormLabel>
          <FormControl>
            <Input
              placeholder={placeholder}
              type={type}
              {...field}
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