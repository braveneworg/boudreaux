'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import HealthStatusIcon from './health-status-icon';
import HealthStatusMessage from './health-status-message';
import { getApiBaseUrl } from '../../lib/utils/database-utils';

import type { HealthStatus } from '../../lib/types/health-status';

const MAX_RETRY_ATTEMPTS = 10;

/**
 * DataStoreHealthStatus component
 * Displays the health status of the database connection
 * Includes retry logic with exponential backoff for network issues
 */
const DataStoreHealthStatus = (): JSX.Element => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const failsafeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHealthStatus = async (retryCount = 0): Promise<void> => {
    console.info(`[Health Check] Attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS} starting...`);
    console.info(
      `[Health Check] Current URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`
    );

    console.info(
      `[Health Check] Protocol: ${typeof window !== 'undefined' ? window.location.protocol : 'N/A'}`
    );
    console.info(
      `[Health Check] Hostname: ${typeof window !== 'undefined' ? window.location.hostname : 'N/A'}`
    );
    console.info(`[Health Check] NODE_ENV: ${process.env.NODE_ENV}`);

    // Get the correct base URL (forces HTTP in development)
    const baseUrl = getApiBaseUrl();
    const apiUrl = `${baseUrl}/api/health`;
    console.info(`[Health Check] Using API URL: ${apiUrl}`);

    try {
      // Add a timeout to prevent infinite hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(apiUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.info(`[Health Check] Response received:`, {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      });

      if (response.ok) {
        const data = (await response.json()) as HealthStatus;
        console.info(`[Health Check] Success! Data:`, data);
        console.info(`[Health Check] Setting healthStatus and isLoading=false`);
        setHealthStatus(data);
        setIsLoading(false);
        // Clear the failsafe timeout on success
        if (failsafeTimeoutRef.current) {
          clearTimeout(failsafeTimeoutRef.current);
          failsafeTimeoutRef.current = null;
        }
        console.info(`[Health Check] State updated successfully`);
        return;
      } else {
        // Try to parse error response
        let errorData: Partial<HealthStatus>;
        try {
          errorData = (await response.json()) as Partial<HealthStatus>;
        } catch {
          errorData = { database: 'Failed to parse response', status: 'error' };
        }

        // Retry on 500 errors (server issues) but not on 404 or other client errors
        if (response.status >= 500 && retryCount < 10) {
          const delay =
            retryCount < 3
              ? 500 // First 3 attempts: 500ms each
              : Math.pow(2, retryCount - 3) * 1000; // Later attempts: exponential backoff
          console.info(
            `Server error, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`
          );
          setTimeout(() => {
            void fetchHealthStatus(retryCount + 1);
          }, delay);
          return;
        }

        setHealthStatus({
          status: 'error',
          database: errorData.database || 'Failed to fetch health status',
          error: errorData.error,
        });
        setIsLoading(false);
        // Clear the failsafe timeout on error
        if (failsafeTimeoutRef.current) {
          clearTimeout(failsafeTimeoutRef.current);
          failsafeTimeoutRef.current = null;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'Unknown';
      const isAbortError = errorName === 'AbortError' || errorMessage.includes('aborted');
      const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network');

      console.error('[Health Check] Fetch error:', {
        name: errorName,
        message: errorMessage,
        error,
        retryCount,
        currentUrl: typeof window !== 'undefined' ? window.location.href : 'N/A',
        isAbortError,
        isNetworkError,
      });

      // Handle timeout separately - treat as temporary failure, retry with backoff
      if (isAbortError) {
        console.warn('[Health Check] Request timed out after 5 seconds');
      }

      // Retry up to 10 times with progressive backoff
      // First few attempts are quick to handle route compilation
      // Later attempts use exponential backoff for network issues
      if (retryCount < 10) {
        const delay =
          retryCount < 3
            ? 500 // First 3 attempts: 500ms each (for route compilation)
            : Math.pow(2, retryCount - 3) * 1000; // Later attempts: 1s, 2s, 4s, 8s, 16s, 32s, 64s
        console.info(
          `Retrying health check in ${delay}ms... (attempt ${retryCount + 1}/10) - Error: ${errorMessage}`
        );
        setTimeout(() => {
          void fetchHealthStatus(retryCount + 1);
        }, delay);
        return; // Keep loading state while retrying
      }

      // Only set error state after all retries exhausted
      console.error('All retry attempts exhausted. Showing error to user.');
      setHealthStatus({
        status: 'error',
        database: 'Failed to fetch health status',
        error:
          errorMessage.includes('SSL') || errorMessage.includes('ERR_')
            ? 'Connection error - Please check your network or try using http://localhost:3000'
            : errorMessage,
      });
      setIsLoading(false);
      // Clear the failsafe timeout on error
      if (failsafeTimeoutRef.current) {
        clearTimeout(failsafeTimeoutRef.current);
        failsafeTimeoutRef.current = null;
      }
    }
  };

  useEffect(() => {
    // Reset state on mount/refresh
    setIsLoading(true);
    setHealthStatus(null);
    let isMounted = true;

    // Start health check immediately
    // The retry logic will handle route compilation delays
    console.info('[Health Check] Starting health check...');
    void fetchHealthStatus();

    // Failsafe: If still loading after 60 seconds, show error
    failsafeTimeoutRef.current = setTimeout(() => {
      if (isMounted) {
        console.error('[Health Check] Failsafe triggered: Still loading after 60 seconds');
        setHealthStatus({
          status: 'error',
          database: 'Health check timed out',
          error: 'The health check took too long. Please refresh the page.',
        });
        setIsLoading(false);
      }
    }, 60000); // 60 seconds

    return () => {
      isMounted = false;
      if (failsafeTimeoutRef.current) {
        clearTimeout(failsafeTimeoutRef.current);
        failsafeTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col justify-center items-center sm:items-center">
      <p className="mt-8 pb-1">
        DB health status:&nbsp;{' '}
        <HealthStatusIcon status={healthStatus?.status ?? null} isLoading={isLoading} />
      </p>
      <p className="border-b-2 pb-1">
        <HealthStatusMessage healthStatus={healthStatus} isLoading={isLoading} />
      </p>
    </div>
  );
};

export default DataStoreHealthStatus;
