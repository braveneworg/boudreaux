/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { SuccessContainer } from './container';

// Mock next/link — simple anchor so href + text are testable
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a data-testid="next-link" href={href}>
      {children}
    </a>
  ),
}));

// Mock next/image using <span> to avoid the @next/next/no-img-element lint rule,
// surfacing forwarded props as data-* attributes (matches image-heading.spec.tsx pattern).
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span
      aria-hidden={props['aria-hidden'] as boolean | undefined}
      className={props.className as string | undefined}
      data-alt={props.alt as string}
      data-src={props.src as string}
      data-testid="next-image"
    />
  ),
}));

// ImageHeading uses useIsMobile — stub it
vi.mock('@/app/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

describe('SignoutSuccessContainer', () => {
  it('renders success heading as an image inside an h1', () => {
    render(<SuccessContainer />);
    expect(screen.getByTestId('next-image')).toHaveAttribute('data-alt', 'success');
  });

  it('renders signed-out confirmation text', () => {
    render(<SuccessContainer />);
    expect(screen.getByText(/You're signed out/i)).toBeInTheDocument();
  });

  it('renders signout success body message', () => {
    render(<SuccessContainer />);
    expect(screen.getByText(/successfully signed out/i)).toBeInTheDocument();
  });

  it('includes a browser privacy reminder', () => {
    render(<SuccessContainer />);
    expect(screen.getByText(/close your browser to protect your privacy/i)).toBeInTheDocument();
  });

  it('renders a prominent "Sign back in" CTA linking to /signin', () => {
    render(<SuccessContainer />);
    expect(screen.getByRole('link', { name: /sign back in/i })).toHaveAttribute('href', '/signin');
  });

  it('renders an accessible home link', () => {
    render(<SuccessContainer />);
    expect(screen.getByRole('link', { name: /go to homepage/i })).toHaveAttribute('href', '/');
  });
});
