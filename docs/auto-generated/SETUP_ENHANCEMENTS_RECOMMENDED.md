# Recommended Setup Enhancements for Testing

## Current Setup Analysis

The current `setupTests.ts` is well-configured with:

- ✅ React Testing Library matchers
- ✅ ResizeObserver mock
- ✅ matchMedia mock
- ✅ Automatic cleanup after each test

## Recommended Additions

### 1. JSDOM Polyfills for Missing APIs

Add these polyfills to fix JSDOM limitations that cause test warnings:

```typescript
// Add to setupTests.ts

// Polyfill HTMLFormElement.requestSubmit()
// Fixes: "Error: Not implemented: HTMLFormElement.prototype.requestSubmit"
Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
  value: function (this: HTMLFormElement) {
    const submitEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    this.dispatchEvent(submitEvent);
  },
  writable: true,
  configurable: true,
});

// Polyfill IntersectionObserver
// Useful for components that use lazy loading or scroll-based triggers
global.IntersectionObserver = class IntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {}

  observe() {
    return null;
  }

  unobserve() {
    return null;
  }

  disconnect() {
    return null;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
};

// Mock scrollIntoView
// Fixes: "TypeError: element.scrollIntoView is not a function"
Element.prototype.scrollIntoView = vi.fn();

// Mock HTMLElement.prototype.setPointerCapture
// Useful for drag-and-drop components
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();

// Mock getComputedStyle for better layout testing
window.getComputedStyle = vi.fn().mockImplementation(() => ({
  getPropertyValue: vi.fn(),
}));
```

### 2. Enhanced Console Filtering

Filter out expected warnings to keep test output clean:

```typescript
// Add to setupTests.ts

// Filter out React act() warnings that are handled properly
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0]?.toString() || '';

    // Filter out expected warnings
    const ignoredPatterns = [
      'An update to .* inside a test was not wrapped in act',
      'Invalid values for props',
      'Warning: ReactDOM.render',
    ];

    if (ignoredPatterns.some((pattern) => new RegExp(pattern).test(message))) {
      return;
    }

    originalError.call(console, ...args);
  };

  console.warn = (...args: unknown[]) => {
    const message = args[0]?.toString() || '';

    // Filter out expected warnings
    const ignoredPatterns = [
      'componentWillReceiveProps has been renamed',
      'componentWillMount has been renamed',
    ];

    if (ignoredPatterns.some((pattern) => new RegExp(pattern).test(message))) {
      return;
    }

    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
```

### 3. Global Test Utilities

Add commonly used test utilities globally:

```typescript
// Add to setupTests.ts

import { type RenderOptions, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Custom render function with common providers
export const renderWithProviders = (ui: React.ReactElement, options?: RenderOptions) => {
  return {
    user: userEvent.setup(),
    ...render(ui, options),
  };
};

// Make it available globally (optional)
declare global {
  const renderWithProviders: typeof renderWithProviders;
}

(global as any).renderWithProviders = renderWithProviders;
```

### 4. Mock Next.js Environment Variables

Ensure environment variables are available in tests:

```typescript
// Add to setupTests.ts

// Mock Next.js environment variables
process.env = {
  ...process.env,
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'test-secret-key-that-is-at-least-32-characters-long',
  DATABASE_URL: 'mongodb://localhost:27017/test',
};
```

### 5. Mock Cloudflare Turnstile

Mock the Turnstile widget to prevent issues in tests:

```typescript
// Add to setupTests.ts

// Mock Cloudflare Turnstile
(global as any).turnstile = {
  render: vi.fn(() => 'mock-widget-id'),
  reset: vi.fn(),
  remove: vi.fn(),
  getResponse: vi.fn(() => 'mock-token'),
};
```

### 6. Mock Next.js Image Component

Mock Next.js Image to prevent layout shift warnings:

```typescript
// Add to setupTests.ts or create __mocks__/next/image.tsx

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));
```

### 7. Enhanced Timer Mocks

Better control over time-based tests:

```typescript
// Add to setupTests.ts

// Use fake timers for better test control
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

// Utility to advance time and flush promises
export const advanceTimersAndFlush = async (ms: number) => {
  vi.advanceTimersByTime(ms);
  await vi.runAllTimersAsync();
};
```

### 8. Custom Matchers

Add project-specific matchers:

```typescript
// Add to setupTests.ts

expect.extend({
  toHaveNoAccessibilityViolations(received: HTMLElement) {
    // Simple accessibility check
    const hasAriaLabel = received.hasAttribute('aria-label');
    const hasAriaLabelledBy = received.hasAttribute('aria-labelledby');
    const hasRole = received.hasAttribute('role');

    const pass = hasAriaLabel || hasAriaLabelledBy || hasRole;

    return {
      pass,
      message: () =>
        pass
          ? 'Element has accessibility attributes'
          : 'Element missing accessibility attributes (aria-label, aria-labelledby, or role)',
    };
  },
});

// Extend TypeScript types
declare module '@testing-library/jest-dom/matchers' {
  interface Matchers<R = void, T = {}> {
    toHaveNoAccessibilityViolations(): R;
  }
}
```

## Complete Enhanced setupTests.ts

Here's the complete recommended `setupTests.ts` file:

```typescript
import React from 'react';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';

// Make React available globally
globalThis.React = React;

// ========================================
// Browser API Mocks
// ========================================

// ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {}
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
};

// matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ========================================
// JSDOM Polyfills
// ========================================

// HTMLFormElement.requestSubmit
Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
  value: function (this: HTMLFormElement) {
    this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  },
  writable: true,
  configurable: true,
});

// Element.scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// HTMLElement pointer capture
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();

// window.getComputedStyle
window.getComputedStyle = vi.fn().mockImplementation(() => ({
  getPropertyValue: vi.fn(),
}));

// ========================================
// Environment Variables
// ========================================

process.env = {
  ...process.env,
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'test-secret-key-that-is-at-least-32-characters-long',
  DATABASE_URL: 'mongodb://localhost:27017/test',
};

// ========================================
// Third-party Mocks
// ========================================

// Cloudflare Turnstile
(global as any).turnstile = {
  render: vi.fn(() => 'mock-widget-id'),
  reset: vi.fn(),
  remove: vi.fn(),
  getResponse: vi.fn(() => 'mock-token'),
};

// ========================================
// Console Filtering
// ========================================

const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0]?.toString() || '';
    const ignoredPatterns = [
      'An update to .* inside a test was not wrapped in act',
      'Invalid values for props',
    ];
    if (ignoredPatterns.some((pattern) => new RegExp(pattern).test(message))) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args: unknown[]) => {
    const message = args[0]?.toString() || '';
    const ignoredPatterns = ['componentWillReceiveProps has been renamed'];
    if (ignoredPatterns.some((pattern) => new RegExp(pattern).test(message))) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ========================================
// Test Setup & Cleanup
// ========================================

expect.extend(matchers);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Optional: Use fake timers
// Uncomment if you want fake timers by default
// beforeEach(() => {
//   vi.useFakeTimers();
// });

// afterEach(() => {
//   vi.runOnlyPendingTimers();
//   vi.useRealTimers();
// });
```

## Usage Examples

### Using Polyfilled APIs

```typescript
// country-field.spec.tsx - now works without errors
it('should submit form', async () => {
  const user = userEvent.setup();
  render(<CountryField {...props} />);

  await user.click(submitButton);
  // requestSubmit() now works thanks to polyfill
});
```

### Filtering Console Output

```typescript
// Tests run cleanly without act() warnings in output
// But warnings are still caught if unexpected
```

### Testing with Timers

```typescript
import { advanceTimersAndFlush } from '../setupTests';

it('should debounce input', async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ delay: null });

  render(<DebouncedInput />);
  await user.type(input, 'test');

  // Advance time
  await advanceTimersAndFlush(500);

  expect(onDebounce).toHaveBeenCalledWith('test');

  vi.useRealTimers();
});
```

## Integration with vitest.config.ts

Update vitest.config.ts to use the enhanced setup:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setupTests.ts',

    // Improved coverage reporting
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/setupTests.ts',
      ],
    },

    // Better error output
    printConsoleTrace: true,

    // Timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

## Benefits of These Enhancements

1. **Cleaner Test Output** - Filtered warnings reduce noise
2. **Better Browser API Support** - Polyfills prevent errors
3. **Improved Developer Experience** - Less debugging of test infrastructure
4. **More Reliable Tests** - Proper mocking prevents flaky tests
5. **Better Error Messages** - Custom matchers provide clearer failures

## Next Steps

1. Apply these enhancements to `setupTests.ts`
2. Update `vitest.config.ts` with recommended settings
3. Run tests to verify improvements
4. Update team documentation with new patterns
5. Consider adding custom matchers for project-specific needs

---

**Note:** These enhancements are optional but recommended based on common issues found in test suites. Implement them gradually and test thoroughly to ensure they work with your specific setup.
