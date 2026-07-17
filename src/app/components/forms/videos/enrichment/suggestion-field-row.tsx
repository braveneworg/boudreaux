/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];
type SuggestionField = EnrichmentSuggestion['field'];
type SuggestionSource = EnrichmentSuggestion['sources'][number];

const FIELD_LABELS = new Map<SuggestionField, string>([
  ['firstName', 'First name'],
  ['middleName', 'Middle name'],
  ['surname', 'Surname'],
  ['akaNames', 'AKA names'],
  ['bornOn', 'Born on'],
  ['displayName', 'Display name'],
  ['releasedOn', 'Release date'],
  ['description', 'Description'],
  ['featuredArtist', 'Featured artist'],
]);

const CONFIDENCE_LABELS = new Map<EnrichmentSuggestion['confidence'], string>([
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]);

/** Human label for a suggestion field (falls back to the raw field name). */
export const suggestionFieldLabel = (field: SuggestionField): string =>
  FIELD_LABELS.get(field) ?? field;

/** Display label for one source link — its label, else its hostname, else the URL. */
const sourceLabel = ({ url, label }: SuggestionSource): string => {
  if (label) return label;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

interface SuggestionFieldRowProps {
  suggestion: EnrichmentSuggestion;
  /** The current stored/form value shown beside the suggestion (null → '—'). */
  currentValue: string | null;
  /** Disables the action buttons while a mutation is in flight. */
  isBusy: boolean;
  /** Visible Apply button text; the release-date caller overrides it. */
  applyLabel?: string;
  onApply: () => void;
  onDismiss: () => void;
}

/**
 * One suggested fact: label, current vs suggested value, confidence badge,
 * source links, and Apply/Dismiss. Applied rows keep their value with an
 * `Applied` badge; dismissed rows collapse to a muted one-liner (no Undo in
 * v1 — a re-run keeps the dismissal as a fence against re-discovery).
 */
export const SuggestionFieldRow = ({
  suggestion,
  currentValue,
  isBusy,
  applyLabel = 'Apply',
  onApply,
  onDismiss,
}: SuggestionFieldRowProps): React.ReactElement => {
  const label = suggestionFieldLabel(suggestion.field);

  if (suggestion.status === 'dismissed') {
    return <li className="text-sm text-zinc-500">{`${label}: Dismissed`}</li>;
  }

  return (
    <li className="flex flex-col gap-2 border-b border-zinc-200 pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <Badge variant="outline">{CONFIDENCE_LABELS.get(suggestion.confidence) ?? 'Low'}</Badge>
        {suggestion.status === 'applied' ? <Badge>Applied</Badge> : null}
      </div>
      <p className="text-sm">
        {currentValue === null ? (
          <span className="text-zinc-700">
            Current: <span>—</span>
          </span>
        ) : (
          <span className="text-zinc-700">Current: {currentValue}</span>
        )}
        <span className="mx-2" aria-hidden>
          →
        </span>
        <span className="font-medium">{suggestion.value}</span>
        {suggestion.note ? <span className="sr-only">{suggestion.note}</span> : null}
      </p>
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
                {sourceLabel(source)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {suggestion.status === 'pending' ? (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isBusy}
            aria-label={`Apply ${label} suggestion`}
            onClick={onApply}
          >
            {applyLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isBusy}
            aria-label={`Dismiss ${label} suggestion`}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </li>
  );
};
