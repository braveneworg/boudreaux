/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import Image from 'next/image';

import { Expand, XIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/app/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';

/**
 * The thumbnail zoom, for the image inside a `LightboxTrigger`. It answers to
 * the trigger's `data-hovered` (real pointer movement, see `usePointerHover`)
 * and to keyboard focus — never to CSS `:hover`, which fires on every photo
 * that scrolls past a resting cursor.
 */
export const LIGHTBOX_ZOOM_CLASS = cn(
  'transition-transform duration-300',
  'group-data-[hovered]:scale-110 group-focus-visible:scale-110',
  'motion-reduce:transition-none',
  'motion-reduce:group-data-[hovered]:scale-100 motion-reduce:group-focus-visible:scale-100'
);

/** Intrinsic size requested for the enlarged image; the box, not this, sets the fit. */
const ENLARGED_WIDTH_PX = 1200;
const ENLARGED_HEIGHT_PX = 900;

interface LightboxTriggerProps extends Omit<ComponentProps<'button'>, 'aria-label' | 'type'> {
  /** Accessible name — says what opens, e.g. "Expand image: Portrait". */
  label: string;
  /** The thumbnail. Give its image `LIGHTBOX_ZOOM_CLASS` to zoom with the trigger. */
  children: ReactNode;
}

/**
 * The framed thumbnail button that opens a lightbox. Signals "click to
 * enlarge" with a zoom-in cursor and an Expand icon over a dimmed photo, shown
 * when a mouse moves onto it or the keyboard focuses it. Touch shows neither —
 * a tap just opens. Spreads the props a `asChild` trigger hands it.
 */
export const LightboxTrigger = ({
  label,
  className,
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}: LightboxTriggerProps): ReactElement => {
  const { isHovered, hoverProps } = usePointerHover();

  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      data-hovered={isHovered ? '' : undefined}
      onPointerMove={(event) => {
        hoverProps.onPointerMove(event);
        onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        hoverProps.onPointerLeave();
        onPointerLeave?.(event);
      }}
      className={cn(
        'group relative block cursor-zoom-in overflow-hidden border-2 border-black',
        'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
        className
      )}
    >
      {children}
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-black/0 transition-colors',
          'group-focus-visible:bg-black/30 group-data-[hovered]:bg-black/30',
          'motion-reduce:transition-none'
        )}
      >
        <Expand
          className={cn(
            'size-6 text-white opacity-0 transition-opacity',
            'group-focus-visible:opacity-100 group-data-[hovered]:opacity-100',
            'motion-reduce:transition-none'
          )}
          aria-hidden
        />
      </span>
    </button>
  );
};

interface LightboxImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * The enlarged image. Image rows carry no dimensions, so it is fitted rather
 * than cropped: full width of the surface, capped in height so the title,
 * credit, and link under it stay on screen — 60% of the screen in the drawer,
 * 75% of the window in the dialog.
 */
export const LightboxImage = ({ src, alt, className }: LightboxImageProps): ReactElement => (
  <Image
    src={src}
    alt={alt}
    width={ENLARGED_WIDTH_PX}
    height={ENLARGED_HEIGHT_PX}
    className={cn('h-auto max-h-[60dvh] w-full object-contain md:max-h-[75vh]', className)}
  />
);

interface ResponsiveLightboxProps {
  /**
   * The element that opens the lightbox — normally a `LightboxTrigger`.
   * Omitted when the caller opens the lightbox itself (controlled mode).
   */
  trigger?: ReactElement;
  /**
   * Controlled open state. When given, the lightbox never changes it on
   * its own: a close is reported through `onOpenChange` for the caller to
   * apply. Omit both for the self-contained trigger-and-open behaviour.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Radix's close hook: where focus returns once the surface has closed. */
  onCloseAutoFocus?: (event: Event) => void;
  /** Names the surface for assistive tech; hide it with `titleClassName="sr-only"`. */
  title: ReactNode;
  /** Describes the surface; hide it with `descriptionClassName="sr-only"`. */
  description: ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
  /** Extra classes for the desktop dialog, e.g. its max width. */
  dialogClassName?: string;
  children: ReactNode;
}

/**
 * An enlarged view that is a centred dialog on wide viewports and a drawer
 * sliding up from the bottom on narrow ones (`useIsMobile`, under 768px).
 * The open state lives here rather than in either surface, so resizing across
 * the breakpoint swaps the surface without closing it.
 */
export const ResponsiveLightbox = ({
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
  title,
  description,
  titleClassName,
  descriptionClassName,
  dialogClassName,
  children,
}: ResponsiveLightboxProps): ReactElement => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean): void => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} direction="bottom">
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
          <DrawerClose
            className={cn(
              'absolute top-4 right-4 opacity-70 transition-opacity hover:opacity-100',
              'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none'
            )}
          >
            <XIcon className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </DrawerClose>
          <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4">
            <DrawerTitle className={titleClassName}>{title}</DrawerTitle>
            <DrawerDescription className={descriptionClassName}>{description}</DrawerDescription>
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn('max-w-3xl sm:max-w-3xl', dialogClassName)}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <DialogTitle className={titleClassName}>{title}</DialogTitle>
          <DialogDescription className={descriptionClassName}>{description}</DialogDescription>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
