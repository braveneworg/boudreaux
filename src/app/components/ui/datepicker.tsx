/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { Calendar as CalendarIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Input } from './input';

interface DatePickerProps {
  onSelect?: (dateString: string, fieldName: string) => void;
  fieldName: string;
}

export const DatePicker = ({ onSelect, fieldName }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>();
  const [month, setMonth] = useState<Date>(new Date());
  const idRef = useRef(uuidv4());
  const a11yId = `date-picker-${idRef.current}`;
  const dateInputRef = useRef<HTMLInputElement>(null);
  const startDate = new Date(1900, 0, 1);
  const endDate = new Date(2099, 11, 31);

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

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={a11yId} className="px-1 sr-only">
        Use up/down arrow keys to change year, left/right to change month
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="flex w-full items-center">
            <CalendarIcon className="ml-3.5 absolute size-4" />
            <Input
              id={a11yId}
              ref={dateInputRef}
              className="pl-10 text-[0.875rem] leading-5"
              onChange={handleChangeDateInput}
              onKeyDown={handleKeyDown}
              placeholder="mm/dd/yyyy"
              value={
                date?.toLocaleDateString(navigator && navigator.language, {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }) ?? ''
              }
            />
          </div>
        </PopoverTrigger>
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
        </PopoverContent>
      </Popover>
    </div>
  );
};
