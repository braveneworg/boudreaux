/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cn } from '@/lib/utils';

import { SpinnerRingCircle } from './spinner-ring-circle';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerVariant = 'default' | 'primary' | 'accent';

interface MessageSpinnerProps {
  className?: string;
  title?: string;
  size?: SpinnerSize;
  variant?: SpinnerVariant;
}

/** Size-variant Tailwind class groups for the spinner layout. */
interface MessageSpinnerSizeClasses {
  gapClass: string;
  textClass: string;
  containerSize: string;
  spinnerContainerSize: string;
}

const SMALL_SPINNER_SIZE_CLASSES: MessageSpinnerSizeClasses = {
  gapClass: 'gap-2',
  textClass: 'text-sm',
  containerSize: 'size-8 leading-8',
  spinnerContainerSize: 'h-8 w-full relative -left-4',
};

const MESSAGE_SPINNER_SIZE_CLASSES = new Map<SpinnerSize, MessageSpinnerSizeClasses>([
  ['sm', SMALL_SPINNER_SIZE_CLASSES],
  [
    'md',
    {
      gapClass: 'gap-4',
      textClass: 'text-lg',
      containerSize: 'h-8 w-8',
      spinnerContainerSize: 'h-3 w-full relative -left-4',
    },
  ],
  [
    'lg',
    {
      gapClass: 'gap-6',
      textClass: 'text-2xl',
      containerSize: 'h-10 w-10',
      spinnerContainerSize: 'h-3 w-full relative -left-4',
    },
  ],
]);

export const MessageSpinner = ({
  title = 'Loading...',
  size = 'sm',
  variant = 'default',
  className,
}: Readonly<MessageSpinnerProps>) => {
  // Size-variant gap, text, and container classes
  const { gapClass, textClass, containerSize, spinnerContainerSize } =
    MESSAGE_SPINNER_SIZE_CLASSES.get(size) ?? SMALL_SPINNER_SIZE_CLASSES;

  return (
    <div
      className={cn(
        'flex items-center justify-center leading-[16px]',
        gapClass,
        className,
        spinnerContainerSize
      )}
    >
      <SpinnerRingCircle size={size} variant={variant} />
      <div className={cn(`flex items-center justify-center pl-8 ${containerSize}`)}>
        <span className={cn('m-0 p-0 text-zinc-950', textClass)}>{title}</span>
      </div>
    </div>
  );
};
