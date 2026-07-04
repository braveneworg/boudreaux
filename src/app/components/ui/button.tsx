/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive no-underline",
  {
    variants: {
      variant: {
        // The default variant is the DIY zine "stamp": hard black border, paper
        // fill, misregistered offset shadow in the tape-pink accent. Inverts to
        // ink-on-paper on hover and presses into its shadow on active — the
        // tactile flyer/cassette look.
        default:
          'border-2 border-black bg-background text-foreground font-semibold shadow-zine-sm transition-[transform,box-shadow,background-color,color] hover:-translate-x-px hover:-translate-y-px hover:bg-foreground hover:text-background hover:shadow-[4px_4px_0_0_var(--color-menu-item-yellow-300)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        destructive:
          'border-2 border-black bg-destructive text-white shadow-zine-ink transition-[transform,box-shadow,background-color] hover:bg-destructive/90 hover:-translate-x-px hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:ring-destructive/20 disabled:bg-destructive/60',
        outline:
          'border-2 border-black bg-background shadow-zine-ink transition-[transform,box-shadow,background-color,color] hover:bg-accent hover:text-accent-foreground hover:-translate-x-px hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        secondary:
          'border-2 border-black bg-secondary text-secondary-foreground shadow-zine-ink transition-[transform,box-shadow,background-color] hover:bg-secondary/80 hover:-translate-x-px hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline underline-offset-4',
        'link:narrow':
          'text-primary underline underline-offset-4 w-[82px] h-9 px-0 has-[>svg]:px-2.5',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = ({
  className,
  variant,
  size,
  datasetId,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  } & { datasetId?: string }) => {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      data-id={datasetId}
      {...props}
    />
  );
};

export { Button, buttonVariants };
