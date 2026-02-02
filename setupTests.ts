import React from 'react';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// Make React available globally for tests
// This is required by vitest when testing React components
// Next.js doesn't require this, but our test environment does
globalThis.React = React;

// Mock Next.js server modules that cause ESM resolution issues
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/dist/server/web/exports/index.js');
  return {
    ...actual,
    NextResponse: {
      json: vi.fn((data, init) => ({
        json: async () => data,
        status: init?.status || 200,
        headers: new Headers(init?.headers),
      })),
      redirect: vi.fn((url) => ({
        headers: new Headers({ Location: url }),
        status: 307,
      })),
    },
  };
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/dist/client/components/navigation.js');
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    })),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});

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

// Mock window.matchMedia which is not available in Node.js test environment
// This is commonly needed for components that use media queries or responsive hooks
// Only set up window mocks in browser-like environments (jsdom)
if (typeof window !== 'undefined') {
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

expect.extend(matchers); // Add custom jest matchers from jest-dom

// Clean up the DOM and clear mock call history after each test to ensure isolation
afterEach(() => {
  cleanup();
  // Clear all mock call history after each test (but keep implementations intact)
  // This provides a consistent, clean mock state across the entire test suite
  // while preserving mock implementations set up in setupTests or test files.
  // Use vi.clearAllMocks() instead of vi.resetAllMocks() to avoid breaking
  // global mocks like matchMedia, ResizeObserver, IntersectionObserver, etc.
  vi.clearAllMocks();
});
