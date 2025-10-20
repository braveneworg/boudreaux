import React from 'react';

import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Make React available globally for tests
// This is required by vitest when testing React components
// Next.js doesn't require this, but our test environment does
globalThis.React = React;

expect.extend(matchers); // Add custom jest matchers from jest-dom

// Clean up the DOM after each test to prevent memory leaks
afterEach(() => {
  cleanup();
});
