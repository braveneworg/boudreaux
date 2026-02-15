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

export const MessageSpinner = ({
  title = 'Loading...',
  size = 'sm',
  variant = 'default',
  className,
}: Readonly<MessageSpinnerProps>) => {
  // Size-variant gap and text classes
  const gapClass = size === 'sm' ? 'gap-2' : size === 'md' ? 'gap-4' : 'gap-6';
  const textClass = size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-2xl';
  const containerSize =
    size === 'sm' ? 'size-8 leading-8' : size === 'md' ? 'h-8 w-8' : 'h-10 w-10';
  const spinnerContainerSize =
    size === 'sm' ? 'h-8 w-full relative -left-4' : 'h-3 w-full relative -left-4';

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
      <div className={cn(`flex justify-center items-center pl-8 ${containerSize}`)}>
        <span className={cn('text-muted-foreground m-0 p-0', textClass)}>{title}</span>
      </div>
    </div>
  );
};
