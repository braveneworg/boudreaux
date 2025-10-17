import { afterEach, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers); // Add custom jest matchers from jest-dom

// Clean up the DOM after each test to prevent memory leaks
afterEach(() => {
  cleanup();
});
