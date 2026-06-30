/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { render, screen } from '@testing-library/react';

import { Providers } from './providers';

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
