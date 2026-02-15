/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { render, screen } from '@testing-library/react';
import { useSession } from 'next-auth/react';

import { Providers } from './providers';

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSession: vi.fn(),
}));

describe('Providers', () => {
  it('renders children within SessionProvider', () => {
    render(
      <Providers>
        <div>Test Child</div>
      </Providers>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('provides session context to children', () => {
    const TestComponent = () => {
      useSession();
      return <div>Component with session</div>;
    };

    render(
      <Providers>
        <TestComponent />
      </Providers>
    );

    expect(screen.getByText('Component with session')).toBeInTheDocument();
    expect(useSession).toHaveBeenCalled();
  });
});
