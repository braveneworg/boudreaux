/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { Heading } from '@/app/components/ui/heading';
import { SectionHelp } from '@/app/components/ui/section-help';
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
 * help popover that surfaces guidance for the admin. This is a shared (server)
 * component so server-rendered pages can pass a lucide icon component directly;
 * only the interactive help popover ({@link SectionHelp}) is a client component.
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
    <SectionHelp label={`About ${title}`}>{helpText}</SectionHelp>
  </div>
);
