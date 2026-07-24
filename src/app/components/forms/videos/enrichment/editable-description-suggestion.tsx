/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const CONFIDENCE_LABELS = new Map<EnrichmentSuggestion['confidence'], string>([
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]);

interface EditableDescriptionSuggestionProps {
  /** The video-level description suggestion (artistId null). */
  suggestion: EnrichmentSuggestion;
  /** The live form value the suggestion targets — drives the applied state. */
  currentDescription: string;
  /** Disables the actions while a mutation is in flight. */
  isBusy: boolean;
  /** Writes the (possibly edited) text into the mounted RHF form via the parent. */
  onApply: (value: string) => void;
  /** Dismisses the suggestion server-side. */
  onDismiss: () => void;
}

/**
 * The description suggestion, rendered as an editable textarea so the admin can
 * tweak the synthesized prose before applying it. Apply writes the CURRENT
 * textarea text (never a server apply — the parent fills the form). The applied
 * state derives from the live form value equalling the edited text, so editing
 * an applied description re-exposes the actions.
 */
export const EditableDescriptionSuggestion = ({
  suggestion,
  currentDescription,
  isBusy,
  onApply,
  onDismiss,
}: EditableDescriptionSuggestionProps): React.ReactElement => {
  const [text, setText] = useState(suggestion.value);
  // Re-seed when a re-run replaces the suggestion with fresh prose.
  useEffect(() => {
    setText(suggestion.value);
  }, [suggestion.value]);

  const isApplied = currentDescription === text;

  return (
    <div data-testid="video-description-suggestion" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Description</span>
        <Badge variant="outline">{CONFIDENCE_LABELS.get(suggestion.confidence) ?? 'Low'}</Badge>
        {isApplied ? <Badge>Applied</Badge> : null}
      </div>
      <Textarea
        aria-label="Suggested description"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={isBusy}
        className="min-h-24"
      />
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
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={isBusy} onClick={() => onApply(text)}>
            Use this description
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isBusy}
            aria-label="Dismiss Description suggestion"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
};
