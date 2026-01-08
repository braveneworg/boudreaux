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
