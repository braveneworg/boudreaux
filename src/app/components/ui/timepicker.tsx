/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { Clock } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  /** Controlled value in 24-hour HH:mm format */
  value?: string;
  onSelect?: (time: string) => void;
  placeholder?: string;
  className?: string;
}

/** Convert "HH:mm" (24h) → "h:mm AM/PM" for display */
function to12HourDisplay(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = mStr ?? '00';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

/** Parse an HH:mm (24h) string into { hour12, minute, period } for editing */
function parse24(time24: string): { hour: string; minute: string; period: 'AM' | 'PM' } {
  const [hStr, mStr] = time24.split(':');
  const h24 = parseInt(hStr ?? '12', 10);
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return {
    hour: String(h12),
    minute: (mStr ?? '00').padStart(2, '0'),
    period,
  };
}

/** Convert { hour12, minute, period } → "HH:mm" (24h) */
function to24(hour: string, minute: string, period: 'AM' | 'PM'): string {
  let h = parseInt(hour, 10) || 12;
  if (h < 1) h = 1;
  if (h > 12) h = 12;
  let h24 = h;
  if (period === 'AM' && h === 12) h24 = 0;
  else if (period === 'PM' && h !== 12) h24 = h + 12;
  const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const TimePicker = ({
  value,
  onSelect,
  placeholder = 'Select time',
  className,
}: TimePickerProps) => {
  const [open, setOpen] = useState(false);

  const getInitial = () =>
    value ? parse24(value) : { hour: '12', minute: '00', period: 'PM' as const };

  const [hour, setHour] = useState(getInitial().hour);
  const [minute, setMinute] = useState(getInitial().minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(getInitial().period);
  const hourRef = useRef<HTMLInputElement>(null);

  // Sync external controlled value → internal state
  useEffect(() => {
    if (value) {
      const parsed = parse24(value);
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setPeriod(parsed.period);
    } else {
      setHour('12');
      setMinute('00');
      setPeriod('PM');
    }
  }, [value]);

  // Focus hour input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => hourRef.current?.focus(), 0);
    }
  }, [open]);

  const handleApply = () => {
    const paddedMinute = String(Math.min(59, Math.max(0, parseInt(minute, 10) || 0))).padStart(
      2,
      '0'
    );
    const time = to24(hour, paddedMinute, period);
    onSelect?.(time);
    setOpen(false);
  };

  const handleClear = () => {
    onSelect?.('');
    setOpen(false);
  };

  const displayValue = value ? to12HourDisplay(value) : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !displayValue && 'text-muted-foreground',
            className
          )}
        >
          <Clock className="mr-2 size-4 shrink-0" />
          {displayValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-52 p-3"
        align="start"
        avoidCollisions
        collisionPadding={8}
        sideOffset={4}
      >
        {/* Time inputs */}
        <div className="flex items-center gap-1">
          {/* Hour */}
          <Input
            ref={hourRef}
            type="number"
            min={1}
            max={12}
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            onBlur={() => {
              let h = parseInt(hour, 10) || 12;
              if (h < 1) h = 1;
              if (h > 12) h = 12;
              setHour(String(h));
            }}
            className="h-9 w-14 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />

          <span className="text-muted-foreground font-medium">:</span>

          {/* Minute */}
          <Input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            onBlur={() => {
              const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
              setMinute(String(m).padStart(2, '0'));
            }}
            className="h-9 w-14 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />

          {/* AM/PM toggle */}
          <div className="flex flex-col gap-1 ml-1">
            {(['AM', 'PM'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium border transition-colors',
                  period === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-3 flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7 px-2"
            onClick={handleClear}
          >
            Clear
          </Button>
          <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
