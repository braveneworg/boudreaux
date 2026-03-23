/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { PurchaseSuccessStep } from './purchase-success-step';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/constants', () => ({
  MAX_RELEASE_DOWNLOAD_COUNT: 5,
}));

vi.mock('lucide-react', () => ({
  DownloadIcon: () => null,
}));

vi.mock('@/app/components/ui/dialog', () => ({
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (asChild ? <>{children}</> : <button {...rest}>{children}</button>),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PurchaseSuccessStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the "Purchase Complete!" success heading', () => {
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />);

    expect(screen.getByText('Purchase Complete!')).toBeDefined();
  });

  it('renders a download link whose href contains the download API route for the release', () => {
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />);

    const link = screen.getByRole('link', { name: /download now/i });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).href).toContain('/api/releases/release-123/download');
  });

  it('renders the releaseTitle in the dialog description', () => {
    render(<PurchaseSuccessStep releaseId="release-456" releaseTitle="Special Edition EP" />);

    expect(screen.getByText(/Special Edition EP/)).toBeDefined();
  });

  it('renders a confirmation email notice', () => {
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />);

    expect(screen.getByText(/confirmation email/i)).toBeDefined();
  });
});
