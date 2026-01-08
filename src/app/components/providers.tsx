'use client';

import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

import type { ThemeProviderProps } from 'next-themes';

const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
};

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <SessionProvider refetchInterval={0} refetchOnWindowFocus refetchWhenOffline={false}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
};
