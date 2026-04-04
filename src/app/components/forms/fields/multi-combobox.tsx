/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import { Check, ChevronsUpDown, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface MultiComboboxOption {
  value: string;
  label: string;
}

interface MultiComboboxProps {
  className?: string;
  options: MultiComboboxOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export const MultiCombobox = ({
  className,
  options,
  value,
  onValueChange,
  placeholder = 'Select options...',
  emptyMessage = 'No options found.',
  disabled = false,
}: MultiComboboxProps) => {
  const [open, setOpen] = React.useState(false);

  const handleToggle = React.useCallback(
    (optionValue: string) => {
      const next = value.includes(optionValue)
        ? value.filter((v) => v !== optionValue)
        : [...value, optionValue];
      onValueChange(next);
    },
    [value, onValueChange]
  );

  const allSelected = options.length > 0 && value.length === options.length;

  const handleSelectAll = React.useCallback(() => {
    if (allSelected) {
      onValueChange([]);
    } else {
      onValueChange(options.map((o) => o.value));
    }
  }, [allSelected, options, onValueChange]);

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  const handleRemove = React.useCallback(
    (optionValue: string) => {
      onValueChange(value.filter((v) => v !== optionValue));
    },
    [value, onValueChange]
  );

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between', className)}
          >
            {selectedOptions.length > 0 ? (
              <span>
                {selectedOptions.length} {selectedOptions.length === 1 ? 'format' : 'formats'}{' '}
                selected
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" asChild>
          <Command>
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.length > 1 && (
                  <CommandItem onSelect={handleSelectAll} className="font-medium">
                    {allSelected ? 'Deselect all' : 'Select all'}
                    <Check className={cn('ml-auto', allSelected ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                )}
                {options.map((option) => {
                  const isSelected = value.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleToggle(option.value)}
                    >
                      {option.label}
                      <Check className={cn('ml-auto', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Selected formats">
          {selectedOptions.map((option) => (
            <Badge key={option.value} variant="secondary" className="gap-1 text-xs" role="listitem">
              {option.label}
              {!disabled && (
                <button
                  type="button"
                  className="hover:text-foreground ml-0.5 rounded-full outline-none"
                  onClick={() => handleRemove(option.value)}
                  aria-label={`Remove ${option.label}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
