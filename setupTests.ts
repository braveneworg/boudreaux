import { afterEach, vi } from 'vitest';

// Mock server-only module to allow testing server-side code
vi.mock('server-only', () => ({}));

// Pure stub for next/server — extends the native Node.js Request so route handlers get a
// fully-functional headers/json()/text() API without loading any real Next.js module.
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    nextUrl: URL;
    // eslint-disable-next-line no-undef
    constructor(url: string | URL, options?: RequestInit) {
      super(url, options);
      this.nextUrl = new URL(url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      // eslint-disable-next-line no-undef
      json: vi.fn((data: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
        json: async () => data,
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
      })),
      next: vi.fn(() => ({ type: 'next' })),
      redirect: vi.fn((url: string | URL, init?: { status?: number }) => ({
        headers: new Headers({ Location: String(url) }),
        status: init?.status ?? 307,
      })),
    },
  };
});

// Pure stub for next/navigation — avoids loading the real Next.js module in every test context.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
  useParams: vi.fn(() => ({})),
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useSelectedLayoutSegment: vi.fn(() => null),
  useSelectedLayoutSegments: vi.fn(() => []),
}));

// Mock ResizeObserver which is not available in Node.js test environment
// This is commonly needed for components that use responsive layouts or size detection
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;

// Mock IntersectionObserver for components that use lazy loading
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly scrollMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
global.IntersectionObserver = MockIntersectionObserver;

// React, jest-dom matchers, cleanup, and window polyfills are only needed in jsdom.
// node-env tests (*.spec.ts — server actions, API routes, repos, services, utils, schemas)
// skip this block entirely, avoiding ~0.4–0.6s of import overhead per file across
// the ~150 server-side spec files that never touch the DOM.
let cleanupFn: () => void = () => {};

if (typeof window !== 'undefined') {
  // Load React, jest-dom, and testing-library in parallel to minimize startup latency.
  // @testing-library/jest-dom/vitest is a side-effect import that registers all
  // DOM matchers on vitest's expect — no explicit expect.extend() needed.
  const [{ default: React }, { cleanup }] = await Promise.all([
    import('react'),
    import('@testing-library/react'),
    import('@testing-library/jest-dom/vitest'), // side effect: registers all DOM matchers
  ]);

  // Make React available globally for tests
  // This is required by vitest when testing React components
  globalThis.React = React;

  cleanupFn = cleanup;

  // Mock window.matchMedia which is not available in Node.js test environment
  // This is commonly needed for components that use media queries or responsive hooks
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Suppress jsdom "Not implemented: navigation (except hash changes)" errors.
  // jsdom cannot handle window.location.href assignments; these fire console.error
  // messages that cause the test runner to exit with code 1 in CI.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : String(args[0]);
    if (message.includes('Not implemented: navigation (except hash changes)')) {
      return;
    }
    originalConsoleError.call(console, ...args);
  };

  // Mock window.open to prevent jsdom navigation errors from anchor clicks with target="_blank"
  window.open = vi.fn();

  // Suppress jsdom "Not implemented: navigation" errors by intercepting the
  // virtualConsole jsdomError event. jsdom fires these via _virtualConsole.emit("jsdomError"),
  // which bypasses console.error interception since the listener was bound before our override.
  // Instead, we suppress via process.stderr.write for these specific messages.
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((...args: Parameters<typeof process.stderr.write>) => {
    const chunk = args[0];
    if (typeof chunk === 'string' && chunk.includes('Not implemented: navigation')) {
      return true;
    }
    return originalStderrWrite(...args);
  }) as typeof process.stderr.write;

  // Mock scrollTo for scroll-based components
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
  });

  // Mock scrollIntoView for JSDOM
  Element.prototype.scrollIntoView = vi.fn();

  // Override HTMLFormElement.requestSubmit for jsdom (jsdom@26 defines it but throws
  // "Not implemented" when called, so we must replace it unconditionally)
  HTMLFormElement.prototype.requestSubmit = function (submitter?: HTMLElement) {
    if (submitter) {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      this.dispatchEvent(submitEvent);
    } else {
      this.submit();
    }
  };

  // Mock HTMLCanvasElement.getContext for components that use canvas
  // (e.g., chart libraries, image processing, etc.)
  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
    if (contextType === '2d') {
      return {
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(4),
        })),
        putImageData: vi.fn(),
        createImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(4),
        })),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        translate: vi.fn(),
        transform: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        clip: vi.fn(),
        arc: vi.fn(),
        arcTo: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        rect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        canvas: {
          width: 300,
          height: 150,
        },
      };
    }
    return null;
  });
}

// Clean up the DOM after each test to ensure isolation.
// Mock call history is cleared automatically by clearMocks: true in vitest.config.ts.
afterEach(() => {
  cleanupFn();
});
