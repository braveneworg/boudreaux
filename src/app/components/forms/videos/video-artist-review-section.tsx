/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId } from 'react';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ArtistNameParts } from '@/utils/split-artist-name-parts';

import type { VideoArtistReviewEntry } from './use-video-artist-review';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VideoArtistReviewSectionProps {
  entries: VideoArtistReviewEntry[];
  updateDraft: (sourceName: string, patch: Partial<ArtistNameParts>) => void;
  /** Split candidates for the primary name, or null when it isn't multi-artist. */
  primarySplitParts: string[] | null;
  /** Rewrite the artist field: first part primary, rest featured. */
  onApplySplit: (parts: string[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve the display label for a matched artist. */
const resolveMatchName = (displayName: string | null, firstName: string, surname: string): string =>
  displayName ?? `${firstName} ${surname}`.trim();

// ── Sub-components ────────────────────────────────────────────────────────────

interface MatchedEntryProps {
  entry: VideoArtistReviewEntry;
}

const MatchedEntry = ({ entry }: MatchedEntryProps): React.ReactElement | null => {
  if (!entry.match) return null;

  const { id, displayName, firstName, surname } = entry.match;
  const name = resolveMatchName(displayName, firstName, surname);

  return (
    <Badge asChild variant="outline">
      <Link href={`/admin/artists/${id}`}>Links to existing artist {name}</Link>
    </Badge>
  );
};

interface NewEntryFieldsProps {
  entry: VideoArtistReviewEntry;
  idPrefix: string;
  updateDraft: (sourceName: string, patch: Partial<ArtistNameParts>) => void;
}

const NewEntryFields = ({
  entry,
  idPrefix,
  updateDraft,
}: NewEntryFieldsProps): React.ReactElement => {
  const { sourceName, draft } = entry;
  const firstName = draft?.firstName ?? '';
  const middleName = draft?.middleName ?? '';
  const surname = draft?.surname ?? '';
  const displayName = draft?.displayName ?? '';

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-700">{sourceName}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-first`}>First name</Label>
          <Input
            id={`${idPrefix}-first`}
            value={firstName}
            onChange={(e) => updateDraft(sourceName, { firstName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-middle`}>Middle name</Label>
          <Input
            id={`${idPrefix}-middle`}
            value={middleName}
            onChange={(e) => updateDraft(sourceName, { middleName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-surname`}>Surname</Label>
          <Input
            id={`${idPrefix}-surname`}
            value={surname}
            onChange={(e) => updateDraft(sourceName, { surname: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-display`}>Display name</Label>
          <Input
            id={`${idPrefix}-display`}
            value={displayName}
            onChange={(e) => updateDraft(sourceName, { displayName: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};

interface ReviewEntryProps {
  entry: VideoArtistReviewEntry;
  idPrefix: string;
  updateDraft: (sourceName: string, patch: Partial<ArtistNameParts>) => void;
}

const ReviewEntry = ({ entry, idPrefix, updateDraft }: ReviewEntryProps): React.ReactElement => (
  <div className={cn('rounded-none border border-zinc-200 p-3', entry.status === 'new' && 'p-4')}>
    {entry.status === 'matched' ? (
      <MatchedEntry entry={entry} />
    ) : (
      <NewEntryFields entry={entry} idPrefix={idPrefix} updateDraft={updateDraft} />
    )}
  </div>
);

interface PrimarySplitHintProps {
  parts: string[];
  onApplySplit: (parts: string[]) => void;
}

/** Nudge the admin to split a multi-artist primary name into separate artists. */
const PrimarySplitHint = ({ parts, onApplySplit }: PrimarySplitHintProps): React.ReactElement => (
  <div className="space-y-2 rounded-none border border-zinc-200 p-3 text-sm" role="note">
    <p>
      Multiple artists? Split as <strong>{parts.join(' + ')}</strong>
    </p>
    <Button type="button" variant="secondary" size="sm" onClick={() => onApplySplit(parts)}>
      Apply split
    </Button>
  </div>
);

// ── Export ────────────────────────────────────────────────────────────────────

export const VideoArtistReviewSection = ({
  entries,
  updateDraft,
  primarySplitParts,
  onApplySplit,
}: VideoArtistReviewSectionProps): React.ReactElement | null => {
  const idPrefix = useId();

  if (entries.length === 0 && !primarySplitParts) return null;

  return (
    <section className="space-y-4" data-testid="video-artist-review-section">
      <h2 className="font-semibold">Artist Review</h2>
      {primarySplitParts ? (
        <PrimarySplitHint parts={primarySplitParts} onApplySplit={onApplySplit} />
      ) : null}
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <ReviewEntry
            key={entry.sourceName}
            entry={entry}
            idPrefix={`${idPrefix}-${index}`}
            updateDraft={updateDraft}
          />
        ))}
      </div>
    </section>
  );
};
