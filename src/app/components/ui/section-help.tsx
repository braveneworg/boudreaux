/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import { HelpCircle } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';

export interface SectionHelpProps {
  /** Accessible label for the help trigger button. */
  label: string;
  /** Guidance shown inside the popover. */
  children: React.ReactNode;
}

/**
 * Tap/click-friendly help affordance for a {@link SectionHeader}. Isolated in its
 * own client module so the surrounding header can stay a server component (and
 * therefore receive a lucide icon component as a prop without crossing the
 * server→client boundary).
 */
export const SectionHelp = ({ label, children }: SectionHelpProps): React.ReactElement => (
  <Popover>
    <PopoverTrigger
      aria-label={label}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
    >
      <HelpCircle className="size-5" />
    </PopoverTrigger>
    <PopoverContent className="text-sm leading-relaxed">{children}</PopoverContent>
  </Popover>
);
