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

interface ComboboxTriggerContentProps {
  selectedCount: number;
  placeholder: string;
  open: boolean;
}

const ComboboxTriggerContent = ({
  selectedCount,
  placeholder,
  open,
}: ComboboxTriggerContentProps) => (
  <>
    {selectedCount > 0 ? (
      <span>
        {selectedCount} {selectedCount === 1 ? 'format' : 'formats'} selected
      </span>
    ) : (
      <span className="text-zinc-950">{placeholder}</span>
    )}
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {open && (
        <X className="size-3.5 opacity-40 transition-opacity hover:opacity-80" aria-hidden="true" />
      )}
      <ChevronsUpDown className="shrink-0 opacity-50" />
    </span>
    {open && <span className="sr-only">Close formats menu</span>}
  </>
);

interface ComboboxOptionListProps {
  options: MultiComboboxOption[];
  value: string[];
  allSelected: boolean;
  emptyMessage: string;
  onToggle: (optionValue: string) => void;
  onSelectAll: () => void;
}

const ComboboxOptionList = ({
  options,
  value,
  allSelected,
  emptyMessage,
  onToggle,
  onSelectAll,
}: ComboboxOptionListProps) => (
  <CommandList>
    <CommandEmpty>{emptyMessage}</CommandEmpty>
    <CommandGroup>
      {options.length > 1 && (
        <CommandItem onSelect={onSelectAll} className="font-medium">
          {allSelected ? 'Deselect all' : 'Select all'}
          <Check className={cn('ml-auto', allSelected ? 'opacity-100' : 'opacity-0')} />
        </CommandItem>
      )}
      {options.map((option) => (
        <CommandItem
          key={option.value}
          value={option.value}
          onSelect={() => onToggle(option.value)}
        >
          {option.label}
          <Check
            className={cn('ml-auto', value.includes(option.value) ? 'opacity-100' : 'opacity-0')}
          />
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
);

interface SelectedFormatBadgesProps {
  selectedOptions: MultiComboboxOption[];
  disabled: boolean;
  onRemove: (optionValue: string) => void;
}

const SelectedFormatBadges = ({
  selectedOptions,
  disabled,
  onRemove,
}: SelectedFormatBadgesProps) => (
  <div className="flex flex-wrap gap-1.5" role="list" aria-label="Selected formats">
    {selectedOptions.map((option) => (
      <Badge key={option.value} variant="secondary" className="gap-1 text-xs" role="listitem">
        {option.label}
        {!disabled && (
          <button
            type="button"
            className="hover:text-foreground ml-0.5 rounded-full outline-none"
            onClick={() => onRemove(option.value)}
            aria-label={`Remove ${option.label}`}
          >
            <X className="size-3" />
          </button>
        )}
      </Badge>
    ))}
  </div>
);

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

  const selectedOptions = React.useMemo(
    () => options.filter((opt) => value.includes(opt.value)),
    [options, value]
  );

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
            <ComboboxTriggerContent
              selectedCount={selectedOptions.length}
              placeholder={placeholder}
              open={open}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" asChild>
          <Command>
            <ComboboxOptionList
              options={options}
              value={value}
              allSelected={allSelected}
              emptyMessage={emptyMessage}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
            />
          </Command>
        </PopoverContent>
      </Popover>

      {selectedOptions.length > 0 && (
        <SelectedFormatBadges
          selectedOptions={selectedOptions}
          disabled={disabled}
          onRemove={handleRemove}
        />
      )}
    </div>
  );
};
