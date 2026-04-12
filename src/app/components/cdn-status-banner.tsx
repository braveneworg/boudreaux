/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Progress } from '@/app/components/ui/progress';
import { useCdnStatusQuery } from '@/app/hooks/use-cdn-status-query';

const CDNStatusBanner = () => {
  const { isPending: isLoading, data: status } = useCdnStatusQuery();

  if (isLoading || !status || status.status === 'ready') {
    return null;
  }

  const getAlertConfig = () => {
    switch (status.status) {
      case 'invalidating':
        return {
          icon: <RefreshCw className="h-4 w-4 animate-spin" />,
          variant: 'default' as const,
          title: 'Site Update in Progress',
          className: 'border-blue-500 bg-blue-50 text-blue-900',
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          variant: 'destructive' as const,
          title: 'CDN Status Unknown',
          className: '',
        };
      default:
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          variant: 'default' as const,
          title: 'Site Recently Updated',
          className: 'border-green-500 bg-green-50 text-green-900',
        };
    }
  };

  const config = getAlertConfig();
  const progress = status.estimatedMinutesRemaining
    ? ((15 - status.estimatedMinutesRemaining) / 15) * 100
    : 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-4">
      <Alert className={config.className}>
        <div className="flex items-start gap-3">
          {config.icon}
          <div className="flex-1">
            <AlertTitle className="mb-1">{config.title}</AlertTitle>
            <AlertDescription>
              {status.message}
              {status.estimatedMinutesRemaining !== undefined &&
                status.estimatedMinutesRemaining > 0 && (
                  <>
                    <br />
                    <span className="text-sm">
                      Estimated time remaining: ~{status.estimatedMinutesRemaining} minutes
                    </span>
                  </>
                )}
              {status.status === 'invalidating' && (
                <>
                  <br />
                  <span className="text-sm">
                    Some assets may be temporarily unavailable. Please refresh your browser in a few
                    minutes.
                  </span>
                </>
              )}
            </AlertDescription>
            {status.status === 'invalidating' && status.estimatedMinutesRemaining !== undefined && (
              <Progress value={progress} className="mt-2 h-2" />
            )}
          </div>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
      </Alert>
    </div>
  );
};

export default CDNStatusBanner;
