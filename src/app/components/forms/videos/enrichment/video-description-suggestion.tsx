/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const CONFIDENCE_LABELS = new Map<EnrichmentSuggestion['confidence'], string>([
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]);

interface VideoDescriptionSuggestionProps {
  /** The video-level description suggestion (artistId null). */
  suggestion: EnrichmentSuggestion;
  /** True when the bound editor already holds this exact prose. */
  isApplied: boolean;
  /** Disables the action while a mutation is in flight. */
  isBusy: boolean;
  /** Overwrites the bound editor with the suggested prose via the parent. */
  onApply: () => void;
}

/**
 * A pending description suggestion, offered beside the bound editor with its
 * confidence and sources. "Use this description" overwrites the editor (a
 * client-only apply — the parent fills the form); the applied state derives
 * from the live editor value, so editing re-exposes the button. There is no
 * Dismiss: a description suggestion is applied or simply ignored (ADR-0005).
 * Rows that are no longer pending render nothing — an applied row's prose is
 * already in the editor, and a legacy dismissed row has nothing to offer.
 */
export const VideoDescriptionSuggestion = ({
  suggestion,
  isApplied,
  isBusy,
  onApply,
}: VideoDescriptionSuggestionProps): React.ReactElement | null => {
  if (suggestion.status !== 'pending') return null;

  return (
    <div data-testid="video-description-suggestion" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Description</span>
        <Badge variant="outline">{CONFIDENCE_LABELS.get(suggestion.confidence) ?? 'Low'}</Badge>
        {isApplied ? <Badge>Applied</Badge> : null}
      </div>
      <p className="text-sm whitespace-pre-wrap">{suggestion.value}</p>
      {suggestion.sources.length > 0 ? (
        <ul
          aria-label="Sources (each opens in a new tab)"
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
        >
          {suggestion.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {source.label ?? source.url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {isApplied ? (
        <p role="status" className="text-sm text-zinc-700">
          Applied to the form — Save to persist.
        </p>
      ) : (
        <Button type="button" size="sm" disabled={isBusy} onClick={onApply}>
          Use this description
        </Button>
      )}
    </div>
  );
};
