import { render, screen } from '@testing-library/react';

import RootLayout, { metadata, viewport } from './layout';

// Mock next/font/google
vi.mock('next/font/google', () => ({
  Dawning_of_a_New_Day: () => ({
    variable: '--font-dawning-of-a-new-day',
  }),
}));

// Mock next/headers — headers() returns a Promise in Next.js 15+
const mockHeadersGet = vi.fn();
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (key: string) => mockHeadersGet(key),
    }),
}));

// Mock next/server — override setupTests.ts mock to include userAgentFromString
const mockUserAgentFromString = vi.fn();
vi.mock('next/server', () => ({
  userAgentFromString: (ua: string) => mockUserAgentFromString(ua),
}));

// Mock env-validation dynamic import
vi.mock('@/lib/config/env-validation', () => ({
  validateEnvironment: vi.fn(),
}));

// Mock CSS imports (vitest has css: false, but explicit mocks prevent resolution errors)
vi.mock('./globals.css', () => ({}));
vi.mock('video.js/dist/video-js.css', () => ({}));

// Mock child components
vi.mock('./components/header/header', () => ({
  default: ({ isMobile }: { isMobile: boolean }) => (
    <div data-testid="header" data-is-mobile={String(isMobile)}>
      Header
    </div>
  ),
}));

vi.mock('./components/footer/footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
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

describe('RootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: desktop user agent
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === 'user-agent') return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      return null;
    });
    mockUserAgentFromString.mockReturnValue({
      device: { type: undefined },
    });
  });

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
      expect(viewport.maximumScale).toBe(1);
    });

    it('disables user scaling', () => {
      expect(viewport.userScalable).toBe(false);
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
      expect(main).toHaveClass('font-sans', 'px-1.5', 'flex', 'flex-col', 'flex-1');
    });
  });

  describe('device detection', () => {
    it('passes isMobile=false for desktop user agent', async () => {
      mockUserAgentFromString.mockReturnValue({
        device: { type: undefined },
      });

      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('header')).toHaveAttribute('data-is-mobile', 'false');
    });

    it('passes isMobile=true for mobile user agent', async () => {
      mockHeadersGet.mockImplementation((key: string) => {
        if (key === 'user-agent') return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)';
        return null;
      });
      mockUserAgentFromString.mockReturnValue({
        device: { type: 'mobile' },
      });

      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('header')).toHaveAttribute('data-is-mobile', 'true');
    });

    it('passes isMobile=true for tablet user agent', async () => {
      mockHeadersGet.mockImplementation((key: string) => {
        if (key === 'user-agent') return 'Mozilla/5.0 (iPad; CPU OS 17_0)';
        return null;
      });
      mockUserAgentFromString.mockReturnValue({
        device: { type: 'tablet' },
      });

      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('header')).toHaveAttribute('data-is-mobile', 'true');
    });

    it('passes isMobile=false when user-agent header is empty', async () => {
      mockHeadersGet.mockReturnValue(null);
      mockUserAgentFromString.mockReturnValue({
        device: {},
      });

      render(await RootLayout({ children: <div>Test</div> }));

      expect(screen.getByTestId('header')).toHaveAttribute('data-is-mobile', 'false');
    });

    it('calls userAgentFromString with the user-agent header value', async () => {
      const expectedUA = 'TestBrowser/1.0';
      mockHeadersGet.mockImplementation((key: string) => {
        if (key === 'user-agent') return expectedUA;
        return null;
      });
      mockUserAgentFromString.mockReturnValue({ device: {} });

      await RootLayout({ children: <div>Test</div> });

      expect(mockUserAgentFromString).toHaveBeenCalledWith(expectedUA);
    });

    it('falls back to empty string when user-agent header is null', async () => {
      mockHeadersGet.mockReturnValue(null);
      mockUserAgentFromString.mockReturnValue({ device: {} });

      await RootLayout({ children: <div>Test</div> });

      expect(mockUserAgentFromString).toHaveBeenCalledWith('');
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

    it('renders body with font variable class', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const body = jsx.props.children;

      expect(body.props.className).toContain('--font-dawning-of-a-new-day');
    });

    it('renders body with layout classes', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const body = jsx.props.children;

      expect(body.props.className).toContain('antialiased');
      expect(body.props.className).toContain('flex');
      expect(body.props.className).toContain('flex-col');
      expect(body.props.className).toContain('min-h-screen');
    });

    it('renders body with suppressHydrationWarning', async () => {
      const jsx = await RootLayout({ children: <div>Test</div> });
      const body = jsx.props.children;

      expect(body.props.suppressHydrationWarning).toBe(true);
    });
  });
});
