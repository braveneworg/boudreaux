/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { queryRetryDelay, shouldRetryQuery } from '@/lib/utils/query-retry';

import { Providers } from './providers';

import type { DefaultOptions } from '@tanstack/react-query';

/** Captures the provided client's query defaults so the wiring can be asserted. */
const captured: { queries?: DefaultOptions['queries'] } = {};
const CaptureQueryDefaults = () => {
  captured.queries = useQueryClient().getDefaultOptions().queries;
  return null;
};

describe('Providers', () => {
  it('renders its children', () => {
    render(
      <Providers>
        <div>Test Child</div>
      </Providers>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('renders nested children (theme + query providers compose)', () => {
    render(
      <Providers>
        <div>Nested Child</div>
      </Providers>
    );

    expect(screen.getByText('Nested Child')).toBeInTheDocument();
  });

  // A fixed `retry: 1` re-fired every throttled request of a page mount at
  // the same instant, tripping the nginx limiter a second time (2026-09-21).
  it('retries queries through the shared retryable-failure predicate', () => {
    render(
      <Providers>
        <CaptureQueryDefaults />
      </Providers>
    );

    expect(captured.queries?.retry).toBe(shouldRetryQuery);
  });

  it('spaces query retries with the shared backoff', () => {
    render(
      <Providers>
        <CaptureQueryDefaults />
      </Providers>
    );

    expect(captured.queries?.retryDelay).toBe(queryRetryDelay);
  });

  it('renders with cache disabled when NEXT_PUBLIC_DISABLE_QUERY_CACHE is true', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_DISABLE_QUERY_CACHE', 'true');

    const { Providers: DisabledCacheProviders } = await import('./providers');

    render(
      <DisabledCacheProviders>
        <div>Cache Disabled Child</div>
      </DisabledCacheProviders>
    );

    expect(screen.getByText('Cache Disabled Child')).toBeInTheDocument();

    vi.unstubAllEnvs();
  });
});
