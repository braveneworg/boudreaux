/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Search, X } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';

export interface TourSearchProps {
  /** Current search value */
  value: string;
  /** Called when search value changes */
  onChange: (value: string) => void;
  /** Placeholder text for search input */
  placeholder?: string;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Whether the search is disabled */
  disabled?: boolean;
}

/**
 * Tour search component with debounced input and clear functionality
 * Client Component - provides real-time search filtering
 */
export const TourSearch = ({
  value,
  onChange,
  placeholder = 'Search tours, artists, venues...',
  debounceMs = 300,
  disabled = false,
}: TourSearchProps) => {
  const [localValue, setLocalValue] = useState(value);

  // Sync local value with prop value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce the onChange callback
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, value, onChange, debounceMs]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={localValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-9"
          aria-label="Search tours"
        />
        {localValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
