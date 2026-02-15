/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Test utilities index
 *
 * Centralized exports for all test utilities.
 *
 * Usage:
 * ```ts
 * import { renderWithUser, createMockRouter, createMockFormData } from '@/test-utils';
 * ```
 */

// Re-export render utilities
export {
  renderWithUser,
  renderWithProviders,
  renderWithForm,
  waitForStateUpdate,
  createMockEvent,
  createMockChangeEvent,
  createAsyncMock,
  createRejectedMock,
} from './render-utils';

// Re-export shared mocks
export {
  mockServerOnly,
  createMockRouter,
  createMockSession,
  createMockToast,
  createMockPrismaResponse,
  createMockFormData,
  createMockFetchResponse,
  createMockAdminAuth,
  createMockUserAuth,
  createMockNoAuth,
  createMockUseSession,
  createMockArtist,
  createMockRelease,
  createMockTrack,
  createMockUser,
} from './shared-mocks';

// Re-export testing library for convenience
export { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
