'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import AuthToolbar from './components/auth/auth-toolbar';

export default function Home() {
  const [healthStatus, setHealthStatus] = useState<{
    status: string;
    database: string;
    latency?: number;
    error?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealthStatus = async (retryCount = 0): Promise<void> => {
    console.log(`[Health Check] Attempt ${retryCount + 1}/6 starting...`);
    console.log(
      `[Health Check] Current URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`
    );

    try {
      const response = await fetch('/api/health', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      console.log(`[Health Check] Response received:`, {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Health Check] Success! Data:`, data);
        setHealthStatus(data);
        setIsLoading(false);
        return;
      } else {
        // Try to parse error response
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { database: 'Failed to parse response', status: 'error' };
        }

        // Retry on 500 errors (server issues) but not on 404 or other client errors
        if (response.status >= 500 && retryCount < 5) {
          const delay = Math.pow(2, retryCount) * 500;
          console.log(`Server error, retrying in ${delay}ms... (attempt ${retryCount + 1}/5)`);
          setTimeout(() => {
            fetchHealthStatus(retryCount + 1);
          }, delay);
          return;
        }

        setHealthStatus({
          status: 'error',
          database: errorData.database || 'Failed to fetch health status',
          error: errorData.error,
        });
        setIsLoading(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'Unknown';

      console.error('[Health Check] Fetch error:', {
        name: errorName,
        message: errorMessage,
        error,
        retryCount,
        currentUrl: typeof window !== 'undefined' ? window.location.href : 'N/A',
        isAbortError: errorName === 'AbortError',
        isNetworkError: errorMessage.includes('fetch') || errorMessage.includes('network'),
      });

      // Retry up to 5 times with exponential backoff (useful during dev when routes are compiling)
      if (retryCount < 5) {
        const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s, 4s, 8s
        console.log(
          `Retrying health check in ${delay}ms... (attempt ${retryCount + 1}/5) - Error: ${errorMessage}`
        );
        setTimeout(() => {
          fetchHealthStatus(retryCount + 1);
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
    }
  };

  useEffect(() => {
    // Reset state on mount/refresh
    setIsLoading(true);
    setHealthStatus(null);

    // Longer delay to ensure route is fully compiled
    // In development, Turbopack compiles routes on-demand
    const timer = setTimeout(() => {
      fetchHealthStatus();
    }, 1000); // Increased from 300ms to 1000ms

    return () => clearTimeout(timer);
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
