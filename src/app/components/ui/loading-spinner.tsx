import { cn } from '@/lib/utils';

import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

interface LoadingSpinnerProps {
  className?: string;
}

export const LoadingSpinner = ({ className }: LoadingSpinnerProps) => {
  return (
    // Use the class name to adjust layout and size as needed
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <span className="text-sm text-muted-foreground">Loading...</span>
      <SpinnerRingCircle />
    </div>
  );
};
