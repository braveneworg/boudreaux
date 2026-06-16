/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '@/lib/utils';

const Avatar = ({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) => (
  <AvatarPrimitive.Root
    data-slot="avatar"
    className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
);

const AvatarImage = ({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) => (
  <AvatarPrimitive.Image
    data-slot="avatar-image"
    className={cn('aspect-square size-full', className)}
    {...props}
  />
);

const AvatarFallback = ({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) => (
  <AvatarPrimitive.Fallback
    data-slot="avatar-fallback"
    className={cn('bg-muted flex size-full items-center justify-center rounded-full', className)}
    {...props}
  />
);

export { Avatar, AvatarImage, AvatarFallback };
