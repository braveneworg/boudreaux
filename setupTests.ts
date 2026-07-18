import { afterEach, vi } from 'vitest';

// Pristine snapshot of the environment captured at setup-file load. Restored
// after every test so per-test env mutations — `vi.stubEnv`, raw
// `process.env.X = …`, or `delete process.env.X` — can't bleed into a later
// test. vmThreads already isolates `process.env` across files, so this guards
// the in-file, cross-test case (e.g. specs that set `CDN_DOMAIN` inside `it`
// blocks without cleanup), keeping shuffled test order deterministic.
const PRISTINE_ENV = { ...process.env };

// Mock server-only module to allow testing server-side code
vi.mock('server-only', () => ({}));

// Auto-mock zustand via __mocks__/zustand.ts: every store created in a test
// file registers a reset fn and the mock's own afterEach restores initial
// state between tests, so module-level stores cannot leak state across tests.
vi.mock('zustand');

// Global safety-net mock for the Prisma client singleton. `src/lib/prisma.ts`
// constructs `new PrismaClient()` at module load, and the generated library
// engine initializes its native N-API addon eagerly. Loading that native engine
// inside vitest's vmThreads VM context aborts the worker ("Failed to deserialize
// constructor options" -> SIGABRT, exit 134) — this only bites in CI, where
// `prisma generate` has produced a real client (locally the un-generated stub is
// inert). Per project convention, unit tests mock Prisma at the service/repository
// boundary; this is the global guard so no spec can ever reach the real engine.
// Specs needing behavior supply their own `vi.mock('@/lib/prisma', ...)`, which
// overrides this; `prisma.spec.ts` tests the real singleton via `vi.importActual`.
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_target, prop) => (prop === 'then' ? undefined : vi.fn()) }),
}));

// Pure stub for next/server — extends the native Node.js Request so route handlers get a
// fully-functional headers/json()/text() API without loading any real Next.js module.
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    nextUrl: URL;
    constructor(url: string | URL, options?: RequestInit) {
      super(url, options);
      this.nextUrl = new URL(url);
    }
  }
  // Class (not plain object) so `new NextResponse(null, { status: 204 })` works too.
  // Statics are attached via Object.assign because their simplified return
  // shapes are intentionally narrower than the native Response statics.
  class MockNextResponse extends Response {}
  Object.assign(MockNextResponse, {
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
  });
  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
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

  // Suppress noisy jsdom "Not implemented" jsdomErrors for APIs jsdom lacks but
  // that unit tests don't meaningfully exercise:
  //   - navigation: window.location.href assignments / anchor target="_blank".
  //   - HTMLFormElement.prototype.requestSubmit: fired when a submit <button>
  //     inside a <form> is clicked. jsdom routes this through its internal impl
  //     (_doRequestSubmit), which throws and bypasses the prototype polyfill below.
  // These spam stderr and can fail CI with a non-zero exit; every other message
  // still surfaces. jsdom emits them via both console.error and the virtualConsole
  // (process.stderr), so guard both channels with one shared matcher.
  const SUPPRESSED_JSDOM_ERRORS = [
    'Not implemented: navigation',
    'Not implemented: HTMLFormElement.prototype.requestSubmit',
  ];
  const isSuppressedJsdomError = (text: string): boolean =>
    SUPPRESSED_JSDOM_ERRORS.some((needle) => text.includes(needle));

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : String(args[0]);
    if (isSuppressedJsdomError(message)) {
      return;
    }
    originalConsoleError.call(console, ...args);
  };

  // Mock window.open to prevent jsdom navigation errors from anchor clicks with target="_blank"
  window.open = vi.fn();

  // jsdom fires the errors above via _virtualConsole.emit("jsdomError"), which
  // bypasses the console.error override (its listener was bound before ours).
  // Catch that channel by filtering process.stderr.write for the same messages.
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((...args: Parameters<typeof process.stderr.write>) => {
    const chunk = args[0];
    if (typeof chunk === 'string' && isSuppressedJsdomError(chunk)) {
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

  // Polyfill Range rect methods for jsdom. ProseMirror/Tiptap's coordsAtPos
  // (reached via scrollToSelection when content is inserted) builds a Range and
  // calls getClientRects()/getBoundingClientRect() on it, both of which jsdom
  // leaves undefined. Without these the editor throws "target.getClientRects is
  // not a function" asynchronously after a test finishes — a flaky unhandled
  // exception that fails the whole vitest shard (see rich-text-editor.spec.tsx).
  // Empty rects are correct here: jsdom has no layout, and singleRect() falls
  // through to getBoundingClientRect() when getClientRects() is empty.
  const emptyDomRect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getClientRects = vi.fn(
    () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: [][Symbol.iterator].bind([]),
      }) as unknown as DOMRectList
  );
  Range.prototype.getBoundingClientRect = vi.fn(() => emptyDomRect);

  // Override HTMLFormElement.requestSubmit for jsdom (jsdom@26 defines it but throws
  // "Not implemented" when called). Use Object.defineProperty because jsdom may
  // define the property as non-writable, making plain assignment silently fail.
  Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
    configurable: true,
    writable: true,
    value: function requestSubmit(submitter?: HTMLElement) {
      if (submitter) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        this.dispatchEvent(submitEvent);
      } else {
        this.submit();
      }
    },
  });

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

  // Persisted zustand stores (and any direct storage writes) must not leak
  // between tests. node-env specs have no window, hence the guard.
  if (typeof window !== 'undefined') {
    window.sessionStorage.clear();
    window.localStorage.clear();
  }

  // Restore any `vi.stubEnv` calls, then reset `process.env` to the pristine
  // snapshot so raw assignments / deletes in one test cannot leak into the next.
  vi.unstubAllEnvs();
  for (const key of Object.keys(process.env)) {
    if (!(key in PRISTINE_ENV)) {
      Reflect.deleteProperty(process.env, key);
    }
  }
  Object.assign(process.env, PRISTINE_ENV);
});
