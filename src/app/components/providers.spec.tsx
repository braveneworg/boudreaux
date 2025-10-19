'use client';

import { render, screen } from '@testing-library/react';
import { Providers } from './providers';
import { useSession } from 'next-auth/react';

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
