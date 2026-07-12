/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { JSX } from 'react';

import { Check, Circle, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { VIDEO_PROGRESS_STAGES } from '@/lib/validation/video-enrichment-schema';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import type { LucideIcon } from 'lucide-react';

type EnrichmentProgress = NonNullable<VideoEnrichmentStatusResult['progress']>;
type EnrichmentStage = (typeof VIDEO_PROGRESS_STAGES)[number];

interface VideoEnrichmentProgressTimelineProps {
  /** Latest polled checkpoint, or null/undefined before any checkpoint arrives. */
  progress: EnrichmentProgress | null | undefined;
}

/** Short label per ordered stage (Map, not index access, for lint safety). */
const STAGE_LABELS = new Map<EnrichmentStage, string>([
  ['musicbrainz', 'MusicBrainz'],
  ['wikidata', 'Wikidata'],
  ['web-search', 'Web search'],
  ['adjudicating', 'Adjudicating'],
  ['finalizing', 'Finalizing'],
]);

/** Per-row lifecycle relative to the active stage — drives icon + styling. */
type StageState = 'complete' | 'active' | 'upcoming';

const STATE_ICON = new Map<StageState, LucideIcon>([
  ['complete', Check],
  ['active', Loader2],
  ['upcoming', Circle],
]);

const ROW_CLASS = new Map<StageState, string>([
  ['complete', 'text-muted-foreground'],
  ['active', 'text-foreground font-medium'],
  ['upcoming', 'text-muted-foreground/50'],
]);

const ICON_CLASS = new Map<StageState, string>([
  ['complete', 'text-primary'],
  ['active', 'text-primary animate-spin'],
  ['upcoming', 'text-muted-foreground/40'],
]);

/** `{value} {key}` comma-joined counts summary, or null when there are none. */
const formatCounts = (counts: EnrichmentProgress['counts']): string | null => {
  if (!counts) return null;
  const parts = Object.entries(counts).map(([key, value]) => `${value} ${key}`);
  return parts.length ? parts.join(', ') : null;
};

interface StageRowProps {
  label: string;
  state: StageState;
  counts: string | null;
}

const StageRow = ({ label, state, counts }: StageRowProps): JSX.Element => {
  const Icon = STATE_ICON.get(state) ?? Circle;
  const isActive = state === 'active';
  return (
    <li
      data-state={state}
      aria-current={isActive ? 'step' : undefined}
      className={cn('flex items-center gap-2 text-sm', ROW_CLASS.get(state))}
    >
      <Icon className={cn('size-4 shrink-0', ICON_CLASS.get(state))} aria-hidden />
      <span>
        {label}
        {isActive && counts ? ` — ${counts}` : ''}
      </span>
    </li>
  );
};

/**
 * Live stage timeline for an in-flight video enrichment, mirroring the bio
 * generation timeline: ordered {@link VIDEO_PROGRESS_STAGES} as an accessible
 * checklist with a monotonic (high-water-mark) active highlight and the
 * active stage's counts inline. Degrades to a static copy line before the
 * first checkpoint.
 *
 * @param progress - The latest polled progress checkpoint (or null/undefined).
 */
export const VideoEnrichmentProgressTimeline = ({
  progress,
}: VideoEnrichmentProgressTimelineProps): JSX.Element => {
  const highestIndexRef = useRef(-1);
  const currentIndex = progress ? VIDEO_PROGRESS_STAGES.indexOf(progress.stage) : -1;
  if (currentIndex > highestIndexRef.current) {
    highestIndexRef.current = currentIndex;
  }
  const activeIndex = highestIndexRef.current;

  if (!progress || activeIndex < 0) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Searching the web for artist and release facts — this can take a few minutes. You can keep
        working; suggestions will appear here when ready.
      </p>
    );
  }

  const countsSummary = formatCounts(progress.counts);

  return (
    <ol className="space-y-1.5" aria-label="Enrichment progress">
      {VIDEO_PROGRESS_STAGES.map((stage, index) => (
        <StageRow
          key={stage}
          label={STAGE_LABELS.get(stage) ?? stage}
          state={index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'upcoming'}
          counts={countsSummary}
        />
      ))}
    </ol>
  );
};
