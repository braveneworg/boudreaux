import { cn } from '@/app/lib/utils';

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
    size === 'sm' ? 'h-[16px] w-[16px] leading-[16px]' : size === 'md' ? 'h-8 w-8' : 'h-10 w-10';
  const spinnerContainerSize = 'h-[16px] w-full relative -left-3 leading-[16px]';

  return (
    <div
      className={cn(
        'flex items-center justify-center my-3',
        gapClass,
        className,
        spinnerContainerSize
      )}
    >
      <SpinnerRingCircle size={size} variant={variant} />
      <div className={cn(`flex justify-center items-center pl-8 ${containerSize}`)}>
        <h2 className={cn('text-muted-foreground', textClass)}>{title}</h2>
      </div>
    </div>
  );
};
