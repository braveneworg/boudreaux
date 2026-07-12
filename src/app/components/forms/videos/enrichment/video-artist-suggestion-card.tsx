/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { Button } from '@/app/components/ui/button';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { SuggestionFieldRow } from './suggestion-field-row';

type EnrichmentArtist = VideoEnrichmentStatusResult['artists'][number];
type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

/**
 * Current stored value for a suggested artist field. An explicit switch —
 * never a dynamic Prisma-style key — mirroring the server's field whitelist.
 */
export const currentArtistFieldValue = (
  current: EnrichmentArtist['current'],
  field: EnrichmentSuggestion['field']
): string | null => {
  switch (field) {
    case 'firstName':
      return current.firstName;
    case 'middleName':
      return current.middleName;
    case 'surname':
      return current.surname;
    case 'akaNames':
      return current.akaNames;
    case 'displayName':
      return current.displayName;
    case 'bornOn':
      return current.bornOn;
    default:
      return null; // 'releasedOn' is video-level and never reaches an artist card
  }
};

interface VideoArtistSuggestionCardProps {
  artist: EnrichmentArtist;
  /** This artist's suggestions only (pre-grouped by the panel). */
  suggestions: EnrichmentSuggestion[];
  isBusy: boolean;
  /** Awaits one server apply; resolves false on failure (stops Apply-all). */
  onApplySuggestion: (
    suggestion: EnrichmentSuggestion,
    expectedCurrent: string | null
  ) => Promise<boolean>;
  onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
}

/**
 * Groups one artist's suggested identity facts with per-field Apply/Dismiss
 * and a sequential Apply-all (stops on the first failure so an
 * `expectedCurrent` conflict never cascades). The artist name links to the
 * admin artist editor for verification after applying.
 */
export const VideoArtistSuggestionCard = ({
  artist,
  suggestions,
  isBusy,
  onApplySuggestion,
  onDismissSuggestion,
}: VideoArtistSuggestionCardProps): React.ReactElement => {
  const pending = suggestions.filter((suggestion) => suggestion.status === 'pending');

  const applyAll = async (): Promise<void> => {
    for (const suggestion of pending) {
      const ok = await onApplySuggestion(
        suggestion,
        currentArtistFieldValue(artist.current, suggestion.field)
      );
      if (!ok) return;
    }
  };

  return (
    <article
      data-testid="video-artist-suggestion-card"
      className="space-y-3 border border-zinc-300 p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <Link href={`/admin/artists/${artist.artistId}`} className="underline underline-offset-2">
            {artist.displayName}
          </Link>
        </h3>
        {pending.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isBusy}
            onClick={() => void applyAll()}
          >
            Apply all
          </Button>
        ) : null}
      </header>
      <ul className="space-y-3">
        {suggestions.map((suggestion) => (
          <SuggestionFieldRow
            key={suggestion.id}
            suggestion={suggestion}
            currentValue={currentArtistFieldValue(artist.current, suggestion.field)}
            isBusy={isBusy}
            onApply={() =>
              void onApplySuggestion(
                suggestion,
                currentArtistFieldValue(artist.current, suggestion.field)
              )
            }
            onDismiss={() => onDismissSuggestion(suggestion)}
          />
        ))}
      </ul>
    </article>
  );
};
