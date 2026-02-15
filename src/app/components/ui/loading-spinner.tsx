/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cn } from '@/lib/utils';

import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

interface LoadingSpinnerProps {
  className?: string;
}

export const LoadingSpinner = ({ className }: LoadingSpinnerProps) => {
  return (
    // Use the class name to adjust layout and size as needed
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <SpinnerRingCircle />
      <span className="text-sm text-muted-foreground">Loading...</span>
    </div>
  );
};
