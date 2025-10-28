'use client';

import React, { useState, useEffect, useRef } from 'react';

import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/app/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

interface ComboboxOption {
  value: string;
  label: string;
  searchValue?: string;
}

interface ComboboxFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: ComboboxOption[];
  popoverWidth?: string;
  onUserInteraction?: () => void;
  setValue?: UseFormSetValue<TFieldValues>;
}

export default function ComboboxField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  options,
  popoverWidth = 'w-[300px]',
  onUserInteraction,
  setValue,
}: ComboboxFieldProps<TFieldValues, TName>) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when the popover opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Use setTimeout to ensure the input is rendered and visible
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Don't open popover on Enter key
    if (event.key === 'Enter') {
      return;
    }
    // Open popover on any alphanumeric key press
    if (!open && event.key.length === 1 && /^[a-z0-9_-]$/i.test(event.key)) {
      event.preventDefault();
      // Set the search value first, before opening
      setSearchValue(event.key);
      setOpen(true);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchValue('');
    }
  };

  const handleValueChange = (value: string) => {
    setSearchValue(value);
    // Close popover if user deletes all text
    if (value === '' && open) {
      setOpen(false);
    }
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                  onKeyDown={handleKeyDown}
                >
                  {field.value
                    ? options.find((option) => option.value === field.value)?.label
                    : placeholder}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className={`${popoverWidth} p-0`} align="start">
              <Command shouldFilter value={searchValue} onValueChange={handleValueChange}>
                <CommandInput ref={inputRef} placeholder={searchPlaceholder} />
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    {options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.searchValue || option.label.toLowerCase()}
                        onSelect={(currentValue) => {
                          onUserInteraction?.();
                          const selectedOption = options.find(
                            (opt) => (opt.searchValue || opt.label.toLowerCase()) === currentValue
                          );
                          if (selectedOption) {
                            if (setValue) {
                              setValue(name, selectedOption.value as TFieldValues[TName], {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                            }
                            field.onChange(selectedOption.value);
                          }
                          setSearchValue('');
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            field.value === option.value ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
