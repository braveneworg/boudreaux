/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { JSX } from 'react';

import type { HealthStatus } from '../../lib/types/health-status';

interface HealthStatusMessageProps {
  healthStatus: HealthStatus | null;
  isLoading: boolean;
}

/**
 * Displays the health status message with database information
 * Shows loading state, database status, latency, and errors
 */
const HealthStatusMessage = ({
  healthStatus,
  isLoading,
}: HealthStatusMessageProps): JSX.Element => {
  if (isLoading) {
    return <>Checking database connection...</>;
  }

  if (!healthStatus) {
    return <>Initializing...</>;
  }

  return (
    <>
      {healthStatus.database}
      {healthStatus.latency !== undefined &&
      healthStatus.latency !== null &&
      healthStatus.latency > 0
        ? ` (${healthStatus.latency}ms)`
        : ''}
      {healthStatus.error && process.env.NODE_ENV === 'development'
        ? ` - ${healthStatus.error}`
        : ''}
    </>
  );
};

export default HealthStatusMessage;
