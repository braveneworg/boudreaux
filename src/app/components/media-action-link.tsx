/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils/tailwind-utils';

import type { LucideIcon } from 'lucide-react';

interface MediaActionLinkProps extends ComponentProps<'button'> {
  icon: LucideIcon;
  label: string;
}

export const MediaActionLink = ({
  icon: Icon,
  label,
  className,
  ref,
  ...props
}: MediaActionLinkProps) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'inline-flex items-center gap-1 underline font-semibold text-zinc-950 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm cursor-pointer',
      className
    )}
    {...props}
  >
    <Icon className="size-4" aria-hidden="true" />
    {label}
  </button>
);
