'use client';

import { CheckCircle, CircleX } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';

import type { ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={'system' as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      icons={{
        success: <CheckCircle className="h-5 w-5 text-green-600" />,
        error: <CircleX className="h-5 w-5 text-red-600" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
