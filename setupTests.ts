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

  // Mock scrollTo for scroll-based components
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
  });

  // Mock scrollIntoView for JSDOM
  Element.prototype.scrollIntoView = vi.fn();

  // Polyfill HTMLFormElement.requestSubmit for jsdom (not implemented in jsdom@26)
  // This is triggered when clicking submit buttons inside forms
  if (!HTMLFormElement.prototype.requestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function (submitter?: HTMLElement) {
      if (submitter) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        this.dispatchEvent(submitEvent);
      } else {
        this.submit();
      }
    };
  }

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
