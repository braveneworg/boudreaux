'use client';

import { useEffect, useState, useRef } from 'react';
import type { JSX } from 'react';

import Image from 'next/image';

import AuthToolbar from './components/auth/auth-toolbar';
import { getApiBaseUrl } from './lib/utils/database-utils';

import type { HealthStatus } from './lib/types/health-status';

export default function Home(): JSX.Element {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const failsafeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHealthStatus = async (retryCount = 0): Promise<void> => {
    console.info(`[Health Check] Attempt ${retryCount + 1}/10 starting...`);
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
          console.info(`Server error, retrying in ${delay}ms... (attempt ${retryCount + 1}/10)`);
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
    <div className="font-sans grid grid-rows-[20px_1fr_20px] justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2">
        <div className="flex flex-col justify-center items-center sm:items-center">
          <h1>
            DB health status:&nbsp;{' '}
            {isLoading
              ? '⏳'
              : healthStatus?.status === 'healthy'
                ? '✅'
                : healthStatus?.status === 'error' || healthStatus?.status === 'unhealthy'
                  ? '❌'
                  : '⏳'}
          </h1>
          <p className="border-b-2">
            {isLoading ? (
              'Checking database connection...'
            ) : healthStatus ? (
              <>
                {healthStatus.database}
                {healthStatus.latency && ` (${healthStatus.latency}ms)`}
                {healthStatus.error && process.env.NODE_ENV === 'development'
                  ? ` - ${healthStatus.error}`
                  : ''}
              </>
            ) : (
              'Initializing...'
            )}
          </p>
        </div>
        <AuthToolbar />
        <Image
          className="dark:invert"
          src="/media/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol className="font-mono list-inside list-decimal text-sm/6 text-center sm:text-left">
          <li className="mb-2 tracking-[-.01em]">
            Get started by editing{' '}
            <code className="bg-black/[.05] dark:bg-white/[.06] font-mono font-semibold px-1 py-0.5 rounded">
              src/app/page.tsx
            </code>
            .
          </li>
          <li className="tracking-[-.01em]">Save and see your changes instantly.</li>
        </ol>
        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/media/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read our docs
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/media/file.svg" alt="File icon" width={16} height={16} />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/media/window.svg" alt="Window icon" width={16} height={16} />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/media/globe.svg" alt="Globe icon" width={16} height={16} />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}
