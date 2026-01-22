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
        'flex-1 font-sans bg-zinc-100 border-t-[1px] border-t-zinc-300 min-h-full flex flex-col w-full pt-2',
        className
      )}
      key="client-only"
      suppressHydrationWarning
    >
      {children}
    </section>
  );
};
