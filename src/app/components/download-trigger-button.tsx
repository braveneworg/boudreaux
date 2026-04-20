/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ComponentProps } from 'react';

import { Download } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Reusable trigger button for the DownloadDialog.
 * Positioned absolutely — must be placed inside a `relative` container.
 */
export const DownloadTriggerButton = ({
  label = 'download',
  className,
  onClick,
  ref,
  ...props
}: ComponentProps<'button'> & { label?: string }) => (
  <button
    ref={ref}
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick?.(e);
    }}
    className={cn(
      'flex items-center gap-1.5 rounded-sm border border-white bg-zinc-900 font-semibold opacity-90 px-2 py-1 text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      className
    )}
    aria-label="Download music"
    {...props}
  >
    <Download className="size-3.5" />
    {label}
  </button>
);
