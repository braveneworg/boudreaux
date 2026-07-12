/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';

import { VideoEnrichmentErrorBoundary } from './video-enrichment-error-boundary';

vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn() }));

const Bomb = (): never => {
  throw new Error('render exploded');
};

describe('VideoEnrichmentErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <VideoEnrichmentErrorBoundary>
        <p>panel content</p>
      </VideoEnrichmentErrorBoundary>
    );

    expect(screen.getByText('panel content')).toBeInTheDocument();
  });

  it('renders the fallback when a child render throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <VideoEnrichmentErrorBoundary>
        <Bomb />
      </VideoEnrichmentErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/enrichment panel failed/i);
    consoleError.mockRestore();
  });
});
