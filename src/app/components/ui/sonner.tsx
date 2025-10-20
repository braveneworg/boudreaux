'use client';

import { CheckCircle, CircleX, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

import type { ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      // className="toaster group"
      toastOptions={{
        classNames: {
          error: 'bg-red-200! text-red-900! border-red-200!',
          success: 'bg-green-200! text-green-600! border-green-300!',
        },
      }}
      icons={{
        success: <CheckCircle className="h-5 w-5 text-green-600" />,
        error: <CircleX className="h-5 w-5 text-red-600" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
