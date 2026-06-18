/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import { HelpCircle } from 'lucide-react';

import { Heading } from '@/app/components/ui/heading';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';

export interface SectionHeaderProps {
  /** Leading section icon (lucide-react). */
  icon: LucideIcon;
  /** Section title text. */
  title: string;
  /** Guidance shown in the tap/click-friendly help popover. */
  helpText: React.ReactNode;
  /** Heading level for correct document outline. Defaults to 1. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}

/**
 * Consistent admin section header: a leading icon, a title, and a tap-friendly
 * help popover that surfaces guidance for the admin. Uses a Popover (rather than
 * a hover-only tooltip) so the guidance is reachable on touch devices too.
 */
export const SectionHeader = ({
  icon: Icon,
  title,
  helpText,
  level = 1,
  className,
}: SectionHeaderProps): React.ReactElement => (
  <div className={cn('flex items-center gap-2', className)}>
    <Icon className="text-primary size-6 shrink-0" aria-hidden="true" />
    <Heading level={level} className="h-auto">
      {title}
    </Heading>
    <Popover>
      <PopoverTrigger
        aria-label={`About ${title}`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
      >
        <HelpCircle className="size-5" />
      </PopoverTrigger>
      <PopoverContent className="text-sm leading-relaxed">{helpText}</PopoverContent>
    </Popover>
  </div>
);
