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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { maskDateInput, parseMaskedDate } from '@/lib/utils/date-mask';

import { Input } from './input';

interface DatePickerProps {
  onSelect?: (dateString: string, fieldName: string) => void;
  fieldName: string;
  /** Controlled value: ISO date string or YYYY-MM-DD */
  value?: string;
}

const DISPLAY_FORMAT = 'MM/dd/yyyy';
const startDate = new Date(1900, 0, 1);
const endDate = new Date(2099, 11, 31);

export const DatePicker = ({ onSelect, fieldName, value }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>();
  const [month, setMonth] = useState<Date>(new Date());
  // The field's live text. Held separately from `date` so a partially-typed,
  // not-yet-valid entry can stay on screen until it parses (or is reverted).
  const [inputValue, setInputValue] = useState('');
  const a11yId = useId();
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Sync external controlled value → internal date + field text.
  useEffect(() => {
    if (value) {
      // Append time to avoid UTC midnight → local-previous-day shift
      const normalized = value.includes('T') ? value : `${value}T00:00:00`;
      const parsed = new Date(normalized);
      if (!isNaN(parsed.getTime())) {
        setDate(parsed);
        setMonth(parsed);
        setInputValue(format(parsed, DISPLAY_FORMAT));
      }
    } else {
      setDate(undefined);
      setInputValue('');
    }
  }, [value]);

  const commitDate = (newDate: Date) => {
    setDate(newDate);
    setMonth(newDate);
    setInputValue(format(newDate, DISPLAY_FORMAT));
    onSelect?.(newDate.toISOString(), fieldName);
  };

  // Mask keystrokes to mm/dd/yyyy and commit only once a complete, valid,
  // in-range date is typed. Partial/invalid input updates the text only.
  const handleChangeDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDateInput(e.target.value);
    setInputValue(masked);
    const parsed = parseMaskedDate(masked);
    if (parsed) {
      commitDate(parsed);
    }
  };

  // On blur: an emptied field clears the value; a partial/invalid entry reverts
  // to the last committed date so the field never rests in a broken state.
  const handleBlurDateInput = () => {
    if (inputValue === '') {
      if (date) {
        setDate(undefined);
        onSelect?.('', fieldName);
      }
      return;
    }
    if (!parseMaskedDate(inputValue)) {
      setInputValue(date ? format(date, DISPLAY_FORMAT) : '');
    }
  };

  const handleClear = () => {
    setDate(undefined);
    setInputValue('');
    onSelect?.('', fieldName);
    setOpen(false);
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

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={a11yId} className="sr-only px-1">
        Type the date as mm/dd/yyyy, or open the calendar to pick a month and year
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative flex w-full items-center" role="group">
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-label="Open calendar"
                className="absolute left-1 size-7 p-0"
              >
                <CalendarIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <Input
              id={a11yId}
              ref={dateInputRef}
              className="pl-10 text-[0.875rem] leading-5"
              onChange={handleChangeDateInput}
              onBlur={handleBlurDateInput}
              inputMode="numeric"
              placeholder="mm/dd/yyyy"
              value={inputValue}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={date}
            captionLayout="dropdown"
            startMonth={startDate}
            endMonth={endDate}
            disabled={{ before: startDate, after: endDate }}
            onSelect={(selected) => {
              if (selected) {
                commitDate(selected);
                setOpen(false);
              }
            }}
          />
          <div className="flex justify-end border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-zinc-950"
              onClick={handleClear}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
