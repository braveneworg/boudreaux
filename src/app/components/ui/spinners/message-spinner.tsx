import { cn } from '@/app/lib/utils';

import { SpinnerRingCircle } from './spinner-ring-circle';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerVariant = 'default' | 'primary' | 'accent';

interface MessageSpinnerProps {
  className?: string;
  title: string;
  size: SpinnerSize;
  variant: SpinnerVariant;
}

export const MessageSpinner = ({ title, size, variant, className }: MessageSpinnerProps) => {
  const containerSize = size === 'sm' ? 'h-24 w-24' : size === 'md' ? 'h-24 w-24' : 'h-32 w-32';

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <h2 className="text-lg">{title}</h2>
      <div className={`flex items-center justify-center bg-slate-100 ${containerSize}`}>
        <SpinnerRingCircle size={size} variant={variant} />
      </div>
    </div>
  );
};
