import React from 'react';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// Make React available globally for tests
// This is required by vitest when testing React components
// Next.js doesn't require this, but our test environment does
globalThis.React = React;

// Mock ResizeObserver which is not available in Node.js test environment
// This is commonly needed for components that use responsive layouts or size detection
global.ResizeObserver = class ResizeObserver {
  observe() {
    // Mock implementation - do nothing
  }
  unobserve() {
    // Mock implementation - do nothing
  }
  disconnect() {
    // Mock implementation - do nothing
  }
};

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

expect.extend(matchers); // Add custom jest matchers from jest-dom

// Clean up the DOM after each test to prevent memory leaks
afterEach(() => {
  cleanup();
});
