/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { cn } from '@/lib/utils';

type ContentContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export const ContentContainer = ({ children, className }: ContentContainerProps) => {
  return (
    <section
      className={cn(
        'flex min-h-full w-full flex-1 flex-col border-t border-t-zinc-300 bg-zinc-100 px-2 pt-2 font-sans',
        className
      )}
      key="client-only"
      suppressHydrationWarning
    >
      {children}
    </section>
  );
};
