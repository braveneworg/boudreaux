/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { type Ref, useState } from 'react';

import { Clock, GripVertical, MoreVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { TimePicker } from '@/app/components/ui/timepicker';
import { cn } from '@/lib/utils';
import { getDisplayName } from '@/lib/utils/get-display-name';

/**
 * Local interfaces matching Prisma model shapes.
 * Client components should not import directly from @prisma/client.
 */
interface TourDateHeadlinerFields {
  id: string;
  tourDateId: string;
  artistId: string | null;
  sortOrder: number;
  setTime: Date | null;
  createdAt: Date;
}

interface ArtistFields {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
  [key: string]: unknown;
}

/** Predefined set of pastel background colors for artist pills */
const PASTEL_COLORS = [
  { bg: '#FFD1DC', textClass: 'text-black' }, // pastel pink
  { bg: '#B5EAD7', textClass: 'text-black' }, // pastel green
  { bg: '#C7CEEA', textClass: 'text-black' }, // pastel lavender
  { bg: '#FFDAC1', textClass: 'text-black' }, // pastel peach
  { bg: '#E2F0CB', textClass: 'text-black' }, // pastel lime
  { bg: '#FFB7B2', textClass: 'text-black' }, // pastel salmon
  { bg: '#B5D8EB', textClass: 'text-black' }, // pastel sky blue
  { bg: '#F3E8FF', textClass: 'text-black' }, // pastel purple
  { bg: '#FFF3B0', textClass: 'text-black' }, // pastel yellow
  { bg: '#D4A5A5', textClass: 'text-white' }, // muted rose
  { bg: '#7EB5A6', textClass: 'text-white' }, // muted teal
  { bg: '#8B7EC8', textClass: 'text-white' }, // muted purple
];

/**
 * Given a relative luminance (0–1), returns true if the background
 * is bright enough for black text (WCAG AA contrast ratio >= 4.5).
 */
function shouldUseBlackText(hexColor: string): boolean {
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  // Contrast ratio with black text (luminance 0): (L + 0.05) / 0.05
  return (luminance + 0.05) / 0.05 >= 4.5;
}

export interface HeadlinerWithRelations extends TourDateHeadlinerFields {
  artist: ArtistFields | null;
}

interface ArtistPillProps {
  headliner: HeadlinerWithRelations;
  index: number;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onSetTimeUpdate: (headlinerId: string, setTime: string | null) => Promise<void>;
  onRemove: (headlinerId: string) => Promise<void>;
  ref?: Ref<HTMLDivElement>;
}

const ArtistPill = ({
  headliner,
  index,
  isDragging,
  dragHandleProps,
  onSetTimeUpdate,
  onRemove,
  ref,
}: ArtistPillProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const colorIndex = index % PASTEL_COLORS.length;
  const color = PASTEL_COLORS[colorIndex];
  const useBlack = shouldUseBlackText(color.bg);
  const textColor = useBlack ? '#000000' : '#ffffff';

  const displayName = headliner.artist
    ? getDisplayName(headliner.artist as unknown as Record<string, unknown>)
    : '(no name)';

  const setTimeDisplay = headliner.setTime
    ? (() => {
        const d = new Date(headliner.setTime);
        const h = d.getUTCHours();
        const m = d.getUTCMinutes();
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
      })()
    : null;

  const handleSetTimeChange = async (time: string) => {
    if (!time) {
      await onSetTimeUpdate(headliner.id, null);
      return;
    }
    // Build a full ISO date string; the date portion doesn't matter for display,
    // but we need a valid DateTime for Prisma storage.
    const isoString = `1970-01-01T${time}:00.000Z`;
    await onSetTimeUpdate(headliner.id, isoString);
  };

  const handleRemoveClick = () => {
    setMenuOpen(false);
    setDeleteDialogOpen(true);
  };

  const handleConfirmRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove(headliner.id);
      setDeleteDialogOpen(false);
    } catch {
      toast.error('Failed to remove artist');
    } finally {
      setIsRemoving(false);
    }
  };

  // Extract HH:mm from setTime for the TimePicker value (read UTC to match stored Z-suffix format)
  const timePickerValue = headliner.setTime
    ? (() => {
        const d = new Date(headliner.setTime);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      })()
    : '';

  return (
    <>
      <div ref={ref} className="inline-flex flex-col items-start">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1',
            'transition-shadow',
            isDragging && 'shadow-lg ring-2 ring-primary/30'
          )}
          style={{ backgroundColor: color.bg }}
        >
          {/* Drag handle */}
          <button
            type="button"
            className="cursor-grab rounded-full p-0.5 opacity-50 hover:opacity-80 active:cursor-grabbing"
            style={{ color: textColor }}
            aria-label="Drag to reorder"
            {...dragHandleProps}
          >
            <GripVertical className="size-3.5" />
          </button>

          {/* Order number circle */}
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: useBlack ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)',
              color: textColor,
            }}
          >
            {index + 1}
          </span>

          {/* Artist name */}
          <span className="px-1 text-sm font-medium" style={{ color: textColor }}>
            {displayName}
          </span>

          {/* Three-dot menu */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'relative flex size-6 shrink-0 items-center justify-center rounded-full',
                  'transition-colors hover:opacity-80',
                  // Invisible 44x44 tap target for accessibility
                  'before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]'
                )}
                style={{
                  backgroundColor: useBlack ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)',
                  color: textColor,
                }}
                aria-label={`Options for ${displayName}`}
              >
                <MoreVertical className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="end" sideOffset={4}>
              <div className="space-y-3">
                {/* Set Time picker */}
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3" />
                    Set Time (optional)
                  </span>
                  <TimePicker
                    value={timePickerValue}
                    placeholder="Select set time"
                    onSelect={handleSetTimeChange}
                  />
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={handleRemoveClick}
                >
                  <Trash2 className="mr-2 size-4" />
                  Remove from tour date
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Set time display below the pill */}
        {setTimeDisplay && (
          <span className="mt-0.5 pl-8 text-xs text-muted-foreground">{setTimeDisplay}</span>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Artist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{displayName}</strong> from this tour date?
              This will not delete the artist from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              disabled={isRemoving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export { ArtistPill };
