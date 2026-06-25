/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cn } from '@/lib/utils';

export interface UploaderDropZoneProps {
  /** Ref forwarded to the hidden file input. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Id for the hidden file input. */
  inputId: string;
  /** Comma-separated `accept` attribute value. */
  accept: string;
  /** Whether the input allows selecting multiple files. */
  multiple: boolean;
  /** Change handler for the file input. */
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Drop handler for the drop zone. */
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  /** Drag-over handler for the drop zone. */
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  /** Drag-leave handler for the drop zone. */
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  /** Accessibility label for the file input. */
  label: string;
  /** Whether files are currently being dragged over the zone. */
  isDragOver: boolean;
  /** Whether the zone is disabled (reordering/deleting/disabled). */
  isDisabled: boolean;
  /** Whether the uploader is disabled via its `disabled` prop. */
  disabled: boolean;
  /** Current number of selected items. */
  currentCount: number;
  /** Maximum number of items allowed. */
  maxCount: number;
  /** Plural noun for the count line, e.g. "images" or "files". */
  countUnit: string;
  /** Icon shown above the call-to-action text. */
  icon: React.ReactNode;
  /** Human-readable accepted types, e.g. "jpeg, png, webp, gif". */
  acceptedTypesLabel: React.ReactNode;
  /** Max file size in megabytes, shown in the hint. */
  maxSizeMb: number;
  /** Message shown when the maximum number of files is reached. */
  maxReachedLabel: React.ReactNode;
  /** Padding/min-height class for the container (differs per uploader). */
  containerClassName: string;
}

/**
 * Whether more files can be added: under the cap and not disabled. Matches the
 * original `count < max && !disabled` semantics (so a disabled uploader shows
 * the "maximum reached" copy regardless of the actual count).
 */
const canAddMoreItems = (currentCount: number, maxCount: number, disabled: boolean): boolean =>
  currentCount < maxCount && !disabled;

const DropZoneCount = ({
  currentCount,
  maxCount,
  countUnit,
}: {
  currentCount: number;
  maxCount: number;
  countUnit: string;
}): React.JSX.Element | null => {
  if (currentCount === 0) return null;

  return (
    <p className="mt-1 text-xs text-zinc-950">
      {currentCount} / {maxCount} {countUnit}
    </p>
  );
};

/**
 * Shared dashed drop zone used by the image and media uploaders. Renders the
 * hidden file input, the drag-and-drop call to action, and an optional file
 * count, preserving the markup both uploaders previously inlined.
 */
export const UploaderDropZone = ({
  inputRef,
  inputId,
  accept,
  multiple,
  onChange,
  onDrop,
  onDragOver,
  onDragLeave,
  label,
  isDragOver,
  isDisabled,
  disabled,
  currentCount,
  maxCount,
  countUnit,
  icon,
  acceptedTypesLabel,
  maxSizeMb,
  maxReachedLabel,
  containerClassName,
}: UploaderDropZoneProps): React.JSX.Element => {
  const canAddMore = canAddMoreItems(currentCount, maxCount, disabled);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
        containerClassName,
        isDragOver && 'border-primary bg-primary/5',
        !isDragOver && 'border-muted-foreground/25 hover:border-muted-foreground/50',
        isDisabled && 'cursor-not-allowed opacity-50',
        !canAddMore && 'pointer-events-none opacity-50'
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        disabled={isDisabled || !canAddMore}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      />
      {icon}
      <p className="text-center text-sm text-zinc-950">
        {canAddMore ? (
          <>
            <span className="text-foreground font-medium">Click to upload</span> or drag and drop
            <br />
            <span className="text-xs">
              {acceptedTypesLabel} up to {maxSizeMb}MB
            </span>
          </>
        ) : (
          maxReachedLabel
        )}
      </p>
      <DropZoneCount currentCount={currentCount} maxCount={maxCount} countUnit={countUnit} />
    </div>
  );
};
