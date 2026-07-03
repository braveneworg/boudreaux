/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

import { reportResponseValidationError } from '@/lib/query-error-reporter';

import { ChatOpenProvider } from './chat/use-chat-open';

import type { ThemeProviderProps } from 'next-themes';

const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
};

const disableCache = process.env.NEXT_PUBLIC_DISABLE_QUERY_CACHE === 'true';

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        // Report only API contract drift (response-validation failures); transient
        // network/abort/HTTP errors are filtered out inside the handler.
        queryCache: new QueryCache({ onError: reportResponseValidationError }),
        defaultOptions: {
          queries: {
            staleTime: disableCache ? 0 : 5 * 60 * 1000,
            gcTime: disableCache ? 0 : 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // better-auth's `useSession` reads from its own nanostore and needs no
  // React context provider, so the legacy `SessionProvider` wrapper is gone.
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        {/* Shares the chat drawer's open state between the global launcher
            and triggers docked inside page panels. */}
        <ChatOpenProvider>{children}</ChatOpenProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
