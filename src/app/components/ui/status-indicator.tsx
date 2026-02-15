/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { CheckIcon, XIcon, LoaderIcon } from 'lucide-react';

import { cn } from '@/lib/utils/tailwind-utils';

interface StatusIndicatorProps {
  isSuccess?: boolean;
  hasError?: boolean;
  hasTimeout?: boolean;
  isPending?: boolean;
  className?: string;
}

const StatusIndicator = ({
  isSuccess,
  hasError,
  hasTimeout,
  isPending,
  className,
}: StatusIndicatorProps) => {
  if (isPending) {
    return (
      <div className={cn('flex items-center justify-center w-6 h-6', className)}>
        <LoaderIcon className="w-4 h-4 animate-spin text-blue-500" />
      </div>
    );
  }

  if (hasTimeout) {
    return (
      <div
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-full bg-red-100',
          className
        )}
      >
        <XIcon className="w-4 h-4 text-red-600" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-full bg-red-100',
          className
        )}
      >
        <XIcon className="w-4 h-4 text-red-600" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-full bg-green-100',
          className
        )}
      >
        <CheckIcon className="w-4 h-4 text-green-600" />
      </div>
    );
  }

  return null;
};

export default StatusIndicator;
