/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Health check types
 * Shared types for health check responses
 */

export type HealthStatusType = 'healthy' | 'unhealthy' | 'error';

export interface HealthStatus {
  status: HealthStatusType;
  database: string;
  latency?: number;
  error?: string;
}

export interface HealthCheckResponse extends HealthStatus {
  timestamp: Date;
}
