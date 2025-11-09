import React from 'react';

import { cn } from '@/app/lib/utils';

type ContentContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export const ContentContainer = ({ children, className }: ContentContainerProps) => {
  return (
    <section
      className={cn(
        'flex-1 font-sans bg-zinc-100 border-t-[1px] border-t-zinc-300 min-h-full flex flex-col flex-1 w-full pt-2 bg-[url(/media/fake-four-hand-outline-and-text-1.png)] bg-fixed bg-repeat',
        className
      )}
      key="client-only"
      suppressHydrationWarning
    >
      {children}
    </section>
  );
};
