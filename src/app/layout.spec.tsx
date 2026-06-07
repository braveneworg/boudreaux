/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import RootLayout, { dynamic, metadata, viewport } from './layout';

// Mock next/font/google
vi.mock('next/font/google', () => ({
  Jost: () => ({
    variable: '--font-jost',
    className: 'font-jost',
  }),
}));

// Mock env-validation dynamic import
vi.mock('@/lib/config/env-validation', () => ({
  validateEnvironment: vi.fn(),
}));

// Mock CSS imports (vitest has css: false, but explicit mocks prevent resolution errors)
vi.mock('./globals.css', () => ({}));

// Mock child components
vi.mock('./components/header/header', () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

vi.mock('./components/footer/footer', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

vi.mock('./components/providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: ({ position }: { position: string }) => (
    <div data-testid="toaster" data-position={position}>
      Toaster
    </div>
  ),
}));

vi.mock('./components/chat/chat-launcher', () => ({
  ChatLauncher: () => <div data-testid="chat-launcher">ChatLauncher</div>,
}));

describe('RootLayout', () => {
  describe('metadata export', () => {
    it('has correct title', () => {
      expect(metadata.title).toBe('Fake Four Inc.');
    });

    it('has correct description', () => {
      expect(metadata.description).toContain('Official site of Fake Four Inc.');
      expect(metadata.description).toContain('independent record label');
    });

    it('disables search indexing', () => {
      expect(metadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });
  });

  describe('viewport export', () => {
    it('has correct width', () => {
      expect(viewport.width).toBe('device-width');
    });

    it('has correct initial scale', () => {
      expect(viewport.initialScale).toBe(1);
    });

    it('has correct maximum scale', () => {
      expect(viewport.maximumScale).toBe(5);
    });

    it('enables user scaling', () => {
      expect(viewport.userScalable).toBe(true);
    });
  });

  describe('route config', () => {
    // The app prerenders nothing; forcing dynamic rendering keeps request-time
    // APIs (e.g. useSearchParams in the global ChatLauncher) out of the static
    // export so the build does not fail with a CSR-bailout error.
    it('forces dynamic rendering for every route', () => {
      expect(dynamic).toBe('force-dynamic');
    });
  });

  describe('rendering', () => {
    it('renders Header component', async () => {
      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('renders Footer component', async () => {
      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('renders Toaster with bottom-center position', async () => {
      render(await RootLayout({ children: <div>Test</div> }));

      const toaster = screen.getByTestId('toaster');
      expect(toaster).toHaveAttribute('data-position', 'bottom-center');
    });

    it('wraps content in Providers', async () => {
      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('providers')).toBeInTheDocument();
    });

    it('renders children within main element', async () => {
      render(await RootLayout({ children: <div data-testid="child">Child Content</div> }));

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('renders main element with correct classes', async () => {
      render(await RootLayout({ children: <div>Test</div> }));

      const main = screen.getByRole('main');
      expect(main).toHaveClass(
        'mx-auto',
        'flex',
        'flex-col',
        'w-full',
        'xl:max-w-7xl',
        'grow',
        'overflow-x-clip'
      );
    });
  });

  describe('html structure', () => {
    it('renders html element with lang="en"', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });

      expect(jsx.props.lang).toBe('en');
    });

    it('renders html element with suppressHydrationWarning', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });

      expect(jsx.props.suppressHydrationWarning).toBe(true);
    });

    it('renders body with overflow-x-clip class', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const children = jsx.props.children;
      const body = Array.isArray(children)
        ? children.find((c: React.JSX.Element) => c.type === 'body')
        : children;

      expect(body.props.className).toContain('overflow-x-clip');
    });

    it('renders body with layout classes', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const children = jsx.props.children;
      const body = Array.isArray(children)
        ? children.find((c: React.JSX.Element) => c.type === 'body')
        : children;

      expect(body.props.className).toContain('antialiased');
      expect(body.props.className).toContain('flex');
      expect(body.props.className).toContain('flex-col');
      expect(body.props.className).toContain('min-h-screen');
    });

    it('renders body with suppressHydrationWarning', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const children = jsx.props.children;
      const body = Array.isArray(children)
        ? children.find((c: React.JSX.Element) => c.type === 'body')
        : children;

      expect(body.props.suppressHydrationWarning).toBe(true);
    });

    it('renders preconnect link for CDN', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const children = jsx.props.children;
      const head = Array.isArray(children)
        ? children.find((c: React.JSX.Element) => c.type === 'head')
        : null;

      expect(head).toBeDefined();
      const links = head.props.children;
      const preconnect = Array.isArray(links)
        ? links.find((l: React.JSX.Element) => l.props?.rel === 'preconnect')
        : null;
      expect(preconnect).toBeDefined();
      expect(preconnect.props.href).toBe('https://cdn.fakefourrecords.com');
    });
  });
});
