/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import { useHealthStatusQuery } from '@/app/hooks/use-health-status-query';

import HealthStatusIcon from './health-status-icon';
import HealthStatusMessage from './health-status-message';

/**
 * DataStoreHealthStatus component
 * Displays the health status of the database connection
 * Uses TanStack Query with built-in retry (10 attempts) and exponential backoff
 */
const DataStoreHealthStatus = (): JSX.Element => {
  const { isPending: isLoading, data: healthStatus } = useHealthStatusQuery();
  const [failsafe, setFailsafe] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFailsafe(true), 60000);
    return () => clearTimeout(timer);
  }, []);

  const effectiveIsLoading = failsafe ? false : isLoading;
  const effectiveHealthStatus =
    failsafe && isLoading
      ? {
          status: 'error' as const,
          database: 'Health check timed out',
          error: 'The health check took too long. Please refresh the page.',
        }
      : healthStatus;

  return (
    <div className="flex flex-col justify-center items-center sm:items-center">
      <p className="mt-8 pb-1">
        DB health status:&nbsp;{' '}
        <HealthStatusIcon
          status={effectiveHealthStatus?.status ?? null}
          isLoading={effectiveIsLoading}
        />
      </p>
      <p className="border-b-2 pb-1">
        <HealthStatusMessage
          healthStatus={effectiveHealthStatus ?? null}
          isLoading={effectiveIsLoading}
        />
      </p>
    </div>
  );
};

export default DataStoreHealthStatus;
