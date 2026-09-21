/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { cn } from '@/lib/utils';

export interface RemovablePillProps extends Omit<
  React.ComponentProps<'span'>,
  'children' | 'onChange'
> {
  /** Display text, already formatted by the caller. */
  label: string;
  /** Invoked when the remove control is activated. */
  onRemove: () => void;
  /** Renders the remove control disabled; `onRemove` cannot fire. */
  disabled?: boolean;
  /** Slot rendered before the label — used for a drag handle. */
  leading?: React.ReactNode;
  /** Dimmed presentation for pills beyond a caller-defined cutoff. */
  muted?: boolean;
}

/**
 * The one removable pill used by every multi-select field.
 *
 * The remove control is a real `<button>` rather than a clickable icon
 * because `badgeVariants` sets `[&>svg]:pointer-events-none`, so an `<X>`
 * rendered directly inside the badge never receives the click.
 *
 * The button stays rendered — and merely disabled — in the `disabled` state,
 * so the affordance and its unavailability are both announced rather than
 * the control silently disappearing.
 */
export const RemovablePill = ({
  label,
  onRemove,
  disabled = false,
  leading,
  muted = false,
  className,
  ...rest
}: RemovablePillProps): React.ReactElement => (
  <Badge variant="secondary" className={cn('gap-1', muted && 'opacity-60', className)} {...rest}>
    {leading}
    {label}
    <button
      type="button"
      className="hover:bg-muted-foreground/20 ml-1"
      disabled={disabled}
      aria-label={`Remove ${label}`}
      onClick={onRemove}
    >
      <X className="h-3 w-3" />
    </button>
  </Badge>
);
