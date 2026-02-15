/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { CircleCheckIcon, OctagonXIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

import type { ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'light' } = useTheme();
  const iconCssClassNames = 'size-4 text-zinc-50';

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      icons={{
        success: <CircleCheckIcon className={iconCssClassNames} />,
        info: <InfoIcon className={iconCssClassNames} />,
        warning: <TriangleAlertIcon className={iconCssClassNames} />,
        error: <OctagonXIcon className={iconCssClassNames} />,
      }}
      toastOptions={{
        classNames: {
          success: '!bg-green-600 !text-zinc-50',
          warning: '!bg-yellow-600 !text-zinc-50',
          error: '!bg-red-600 !text-zinc-50',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
