import React from 'react';

import { cn } from '@/lib/utils';

type ContentContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export const ContentContainer = ({ children, className }: ContentContainerProps) => {
  return (
    <div
      className={cn('p-5 font-sans bg-gray-100 touch-auto', className)}
      key="client-only"
      suppressHydrationWarning
    >
      {children}
    </div>
  );
};
