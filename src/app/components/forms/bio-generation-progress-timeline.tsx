/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { JSX } from 'react';

import { Check, Circle, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { BIO_PROGRESS_STAGES } from '@/lib/validation/bio-generation-schema';
import type { BioProgress, BioProgressStage } from '@/lib/validation/bio-generation-schema';

import type { LucideIcon } from 'lucide-react';

interface BioGenerationProgressTimelineProps {
  /** Latest polled checkpoint, or null/undefined before any checkpoint arrives. */
  progress: BioProgress | null | undefined;
}

/**
 * Short, human-readable label per ordered stage. A `Map` (not an index-access
 * record) so a variable-keyed lookup does not trip the object-injection rule.
 */
const STAGE_LABELS = new Map<BioProgressStage, string>([
  ['musicbrainz', 'MusicBrainz'],
  ['wikidata', 'Wikidata'],
  ['commons', 'Wikimedia Commons'],
  ['cover-art', 'Cover art'],
  ['web-search', 'Web search'],
  ['link-follow', 'Following links'],
  ['vision-gating', 'Verifying images'],
  ['drafting', 'Drafting'],
  ['synthesizing', 'Synthesizing'],
  ['quality-pass', 'Fact-checking'],
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

/**
 * Format a checkpoint's `counts` map into a friendly, generic summary
 * (`{value} {key}`, comma-joined) without hardcoding any key name — e.g.
 * `{ candidates: 3 }` → "3 candidates". Returns null when there are no counts.
 */
const formatCounts = (counts: BioProgress['counts']): string | null => {
  if (!counts) return null;
  const parts = Object.entries(counts).map(([key, value]) => `${value} ${key}`);
  return parts.length ? parts.join(', ') : null;
};

interface StageRowProps {
  label: string;
  state: StageState;
  /** Formatted count summary rendered only when this row is the active one. */
  counts: string | null;
}

/** One stage row: state-driven icon + label, with counts inline when active. */
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
 * Live stage timeline for an in-flight bio generation. Renders the ordered
 * {@link BIO_PROGRESS_STAGES} as an accessible checklist: stages before the
 * active one show complete, the active one spins (announced via
 * `aria-current="step"`), and later ones are muted. The active stage's `counts`
 * render inline. The highlight is monotonic — a late, out-of-order lower-stage
 * update never moves it backwards within a single generation run (the component
 * remounts per run, resetting the high-water mark). When `progress` is
 * null/undefined it degrades to the static "researching" copy line rather than
 * an empty list.
 *
 * @param progress - The latest polled progress checkpoint (or null/undefined).
 */
export const BioGenerationProgressTimeline = ({
  progress,
}: BioGenerationProgressTimelineProps): JSX.Element => {
  // High-water mark of the furthest stage seen this run, so an out-of-order
  // lower checkpoint can never rewind the highlight. Mutating a ref during
  // render is safe here: it is an idempotent max, so re-renders with the same
  // props yield the same result.
  const highestIndexRef = useRef(-1);
  const currentIndex = progress ? BIO_PROGRESS_STAGES.indexOf(progress.stage) : -1;
  if (currentIndex > highestIndexRef.current) {
    highestIndexRef.current = currentIndex;
  }
  const activeIndex = highestIndexRef.current;

  if (!progress || activeIndex < 0) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Researching the web and writing the bio — this can take a few minutes. You can keep working;
        the results will appear here when ready.
      </p>
    );
  }

  const countsSummary = formatCounts(progress.counts);

  return (
    <ol className="space-y-1.5" aria-label="Bio generation progress">
      {BIO_PROGRESS_STAGES.map((stage, index) => (
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
