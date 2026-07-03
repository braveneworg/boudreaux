/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-none border-2 px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 items-center [&>svg]:size-6 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-green-100 text-green-600 border-green-600',
        destructive:
          'text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = ({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) => (
  <div
    data-slot="alert"
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
);

const AlertTitle = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="alert-title"
    className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
    {...props}
  />
);

const AlertDescription = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    data-slot="alert-description"
    className={cn(
      'col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed',
      className
    )}
    {...props}
  />
);

export { Alert, AlertTitle, AlertDescription };
