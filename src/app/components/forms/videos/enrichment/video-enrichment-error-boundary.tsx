/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';

import { error as logError } from '@/lib/utils/console-logger';

interface VideoEnrichmentErrorBoundaryProps {
  children: ReactNode;
}

interface VideoEnrichmentErrorBoundaryState {
  hasError: boolean;
}

/**
 * Contains a crash inside the enrichment panel so the surrounding video form
 * (and its unsaved edits) keep working. React only supports subtree error
 * boundaries as class components — this is the repo's single deliberate
 * exception to the function-components rule.
 */
export class VideoEnrichmentErrorBoundary extends Component<
  VideoEnrichmentErrorBoundaryProps,
  VideoEnrichmentErrorBoundaryState
> {
  state: VideoEnrichmentErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError = (): VideoEnrichmentErrorBoundaryState => ({
    hasError: true,
  });

  componentDidCatch = (caught: Error): void => {
    logError('Video enrichment panel crashed', caught);
  };

  render = (): ReactNode =>
    this.state.hasError ? (
      <p role="alert" className="text-sm text-zinc-700">
        The enrichment panel failed to load. Reload the page to try again.
      </p>
    ) : (
      this.props.children
    );
}
