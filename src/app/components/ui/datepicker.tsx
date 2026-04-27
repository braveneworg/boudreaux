/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

import { Input } from './input';

interface DatePickerProps {
  onSelect?: (dateString: string, fieldName: string) => void;
  fieldName: string;
  /** Controlled value: ISO date string or YYYY-MM-DD */
  value?: string;
}

export const DatePicker = ({ onSelect, fieldName, value }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>();
  const [month, setMonth] = useState<Date>(new Date());
  const a11yId = useId();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const startDate = new Date(1900, 0, 1);
  const endDate = new Date(2099, 11, 31);

  // Sync external controlled value → internal date state
  useEffect(() => {
    if (value) {
      // Append time to avoid UTC midnight → local-previous-day shift
      const normalized = value.includes('T') ? value : `${value}T00:00:00`;
      const parsed = new Date(normalized);
      if (!isNaN(parsed.getTime())) {
        setDate(parsed);
        setMonth(parsed);
      }
    } else {
      setDate(undefined);
    }
  }, [value]);

  const handleChangeDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const parsedDate = new Date(inputValue);
    if (!isNaN(parsedDate.getTime())) {
      setDate(parsedDate);
      onSelect?.(parsedDate.toISOString(), fieldName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const newDate = new Date(date ?? new Date());
      const yearChange = e.key === 'ArrowUp' ? 1 : -1;
      const newYear = newDate.getFullYear() + yearChange;
      if (newYear < 1900 || newYear > 2099) {
        return;
      }
      newDate.setFullYear(newYear);
      setDate(newDate);
      setMonth(newDate);
      onSelect?.(newDate.toISOString(), fieldName);
    } else if (date && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const newDate = new Date(date);
      const monthChange = e.key === 'ArrowRight' ? 1 : -1;
      newDate.setMonth(newDate.getMonth() + monthChange);

      // Check if new date is within bounds
      if (newDate < startDate || newDate > endDate) {
        return;
      }

      setDate(newDate);
      setMonth(newDate);
      onSelect?.(newDate.toISOString(), fieldName);
    }
  };

  // Focus input after popover opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure popover is rendered
      setTimeout(() => {
        dateInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const displayValue = date ? format(date, 'MM/dd/yyyy') : '';

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={a11yId} className="sr-only px-1">
        Use up/down arrow keys to change year, left/right to change month
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="flex w-full items-center" role="group">
            <CalendarIcon className="absolute ml-3.5 size-4" />
            <Input
              id={a11yId}
              ref={dateInputRef}
              className="pl-10 text-[0.875rem] leading-5"
              onChange={handleChangeDateInput}
              onKeyDown={handleKeyDown}
              placeholder="mm/dd/yyyy"
              value={displayValue}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            onDayFocus={() => dateInputRef.current?.focus}
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={date}
            captionLayout="label"
            disabled={{ before: startDate, after: endDate }}
            onSelect={(date) => {
              if (date) {
                setDate(date);
                setMonth(date);
                onSelect?.(date.toISOString(), fieldName);
                setOpen(false);
              }
            }}
          />
          <div className="flex justify-end border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-zinc-950-foreground h-7 px-2 text-xs"
              onClick={() => {
                setDate(undefined);
                onSelect?.('', fieldName);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
