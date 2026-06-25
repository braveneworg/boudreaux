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

// Mock next/image — surfaces alt/src as attributes without loading images
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

// ImageHeading uses useIsMobile — stub it
vi.mock('@/app/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

describe('SignoutSuccessContainer', () => {
  it('renders success heading as an image inside an h1', () => {
    render(<SuccessContainer />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    const headingImage = screen.getByRole('img', { name: /success/i });
    expect(headingImage).toHaveAttribute('alt', 'success');
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
    const links = screen.getAllByRole('link');
    const signinLink = links.find(
      (l) => l.getAttribute('href') === '/signin' && /sign back in/i.test(l.textContent ?? '')
    );
    expect(signinLink).toBeDefined();
    expect(signinLink).toBeInTheDocument();
  });

  it('renders an accessible home link', () => {
    render(<SuccessContainer />);
    const links = screen.getAllByRole('link');
    const homeLink = links.find((l) => l.getAttribute('href') === '/');
    expect(homeLink).toBeDefined();
    expect(homeLink).toBeInTheDocument();
  });
});
