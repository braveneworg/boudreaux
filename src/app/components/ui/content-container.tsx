import React from 'react';

import { cn } from '@/lib/utils';

type ContentContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export const ContentContainer = ({ children, className }: ContentContainerProps) => {
  return (
    <section
      className={cn('font-sans bg-zinc-100 min-h-full flex flex-col flex-1 w-full', className)}
      key="client-only"
      suppressHydrationWarning
    >
      {children}
    </section>
  );
};
