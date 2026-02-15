/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { JSX } from 'react';

import type { HealthStatusType } from '../../lib/types/health-status';

interface HealthStatusIconProps {
  status: HealthStatusType | null;
  isLoading: boolean;
}

/**
 * Displays a visual icon representing the health status
 * - ⏳ for loading state
 * - ✅ for healthy status
 * - ❌ for error or unhealthy status
 */
const HealthStatusIcon = ({ status, isLoading }: HealthStatusIconProps): JSX.Element => {
  if (isLoading) {
    return <>⏳</>;
  }

  if (status === 'healthy') {
    return <>✅</>;
  }

  if (status === 'error' || status === 'unhealthy') {
    return <>❌</>;
  }

  return <>⏳</>;
};

export default HealthStatusIcon;
