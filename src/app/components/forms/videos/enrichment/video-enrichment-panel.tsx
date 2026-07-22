/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Sparkles } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  useApplyVideoSuggestionMutation,
  useRunVideoEnrichmentMutation,
} from '@/components/forms/_hooks/mutations/use-video-enrichment-mutations';
import { useVideoEnrichmentStatusQuery } from '@/components/forms/_hooks/use-video-enrichment-status-query';
import { splitFeaturedArtists } from '@/lib/utils/artist-name-split';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import {
  hasEnrichableArtist,
  VIDEO_LEVEL_SUGGESTION_FIELDS,
} from '@/lib/validation/video-enrichment-schema';
import type {
  VideoEnrichmentStatusResult,
  VideoLevelSuggestionField,
} from '@/lib/validation/video-enrichment-schema';
import {
  CLIENT_POLL_DEADLINE_MS,
  isInFlightJobStatus,
  STALE_JOB_TIMEOUT_MESSAGE,
} from '@/utils/async-job-lifecycle';

import { VideoArtistSuggestionCard } from './video-artist-suggestion-card';
import { VideoEnrichmentProgressTimeline } from './video-enrichment-progress-timeline';
import { VideoEnrichmentStatusChip } from './video-enrichment-status-chip';
import { VideoFieldSuggestion } from './video-field-suggestion';

import type { Control } from 'react-hook-form';

type EnrichmentArtist = VideoEnrichmentStatusResult['artists'][number];
type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

interface VideoEnrichmentPanelProps {
  videoId: string;
  control: Control<VideoFormData>;
  /** Applies a video-level suggestion into the parent RHF form (never the server). */
  onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void;
}

interface ArtistGroup {
  artist: EnrichmentArtist;
  suggestions: EnrichmentSuggestion[];
}

/** Group suggestions under their artist, dropping artists with none. */
export const groupArtistSuggestions = (data: VideoEnrichmentStatusResult): ArtistGroup[] =>
  data.artists
    .map((artist) => ({
      artist,
      suggestions: data.suggestions.filter((s) => s.artistId === artist.artistId),
    }))
    .filter(({ suggestions }) => suggestions.length > 0);

/** Per-video-level-field card config: apply-button label + container test id. */
interface VideoLevelFieldConfig {
  applyLabel: string;
  testId: string;
}

const VIDEO_LEVEL_FIELD_CONFIG = new Map<VideoLevelSuggestionField, VideoLevelFieldConfig>([
  ['releasedOn', { applyLabel: 'Use this date', testId: 'video-release-date-suggestion' }],
  ['description', { applyLabel: 'Use this description', testId: 'video-description-suggestion' }],
  [
    'featuredArtist',
    { applyLabel: 'Add featured artist', testId: 'video-featured-artist-suggestion' },
  ],
]);

/** Copy for the blank-artist gate — asserted verbatim by unit and E2E specs. */
const MISSING_ARTIST_HINT = 'Add an artist or creator to enable web enrichment.';

/** Shared disable condition for both run affordances (busy or blank artist). */
const isRunDisabled = (isBusy: boolean, hasArtist: boolean): boolean => isBusy || !hasArtist;

/** Muted explainer rendered whenever the gate disables the run affordances. */
const MissingArtistHint = (): React.ReactElement => (
  <p className="text-muted-foreground text-sm">{MISSING_ARTIST_HINT}</p>
);

/** Narrow a raw suggestion field to a video-level field, or null (no `as` cast). */
export const toVideoLevelField = (field: string): VideoLevelSuggestionField | null =>
  (VIDEO_LEVEL_SUGGESTION_FIELDS as readonly string[]).includes(field)
    ? (field as VideoLevelSuggestionField)
    : null;

/** True when `name` already appears (case-insensitive) among the artist string's parts. */
const isFeaturedApplied = (artistValue: string, name: string): boolean =>
  splitFeaturedArtists(artistValue).some(
    (part) => part.name.toLowerCase() === name.trim().toLowerCase()
  );

interface RerunEnrichmentDialogProps {
  disabled: boolean;
  onConfirm: () => void;
}

/** Re-run always confirms first — it replaces the pending suggestion rows. */
const RerunEnrichmentDialog = ({ disabled, onConfirm }: RerunEnrichmentDialogProps) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button type="button" variant="secondary" disabled={disabled}>
        <Sparkles className="size-4" aria-hidden />
        Re-run enrichment
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Re-run enrichment?</AlertDialogTitle>
        <AlertDialogDescription>
          Re-running replaces the pending suggestions below. Applied and dismissed suggestions are
          kept.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Re-run</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

interface VideoLevelSuggestionListProps {
  suggestions: EnrichmentSuggestion[];
  control: Control<VideoFormData>;
  isBusy: boolean;
  onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void;
  onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
}

/**
 * All video-level suggestions (`artistId === null`) rendered as one card per
 * row: release date, description, and each featured artist. Watches the three
 * targeted form fields once so every card's applied state derives from the
 * live form — value equality for releasedOn/description, name-membership for
 * featuredArtist. Apply is always client-only (the parent fills the form).
 */
const VideoLevelSuggestionList = ({
  suggestions,
  control,
  isBusy,
  onApplyVideoSuggestion,
  onDismissSuggestion,
}: VideoLevelSuggestionListProps): React.ReactElement => {
  const releasedOn = useWatch({ control, name: 'releasedOn' });
  const description = useWatch({ control, name: 'description' });
  const artist = useWatch({ control, name: 'artist' });

  const isApplied = (field: VideoLevelSuggestionField, value: string): boolean => {
    if (field === 'releasedOn') return (releasedOn ?? '') === value;
    if (field === 'description') return (description ?? '') === value;
    return isFeaturedApplied(artist ?? '', value);
  };

  const currentValueFor = (field: VideoLevelSuggestionField): string | null => {
    if (field === 'releasedOn') return releasedOn || null;
    if (field === 'description') return description || null;
    return artist || null;
  };

  return (
    <>
      {suggestions.map((suggestion) => {
        const field = toVideoLevelField(suggestion.field);
        const config = field === null ? undefined : VIDEO_LEVEL_FIELD_CONFIG.get(field);
        if (field === null || config === undefined) return null;
        const { applyLabel, testId } = config;
        return (
          <VideoFieldSuggestion
            key={suggestion.id}
            suggestion={suggestion}
            currentValue={currentValueFor(field)}
            isAppliedToForm={isApplied(field, suggestion.value)}
            applyLabel={applyLabel}
            testId={testId}
            onApply={() => onApplyVideoSuggestion(field, suggestion.value)}
            onDismiss={() => onDismissSuggestion(suggestion)}
            isBusy={isBusy}
          />
        );
      })}
    </>
  );
};

interface EnrichmentResultsProps {
  data: VideoEnrichmentStatusResult;
  control: Control<VideoFormData>;
  isBusy: boolean;
  onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void;
  onApplySuggestion: (
    suggestion: EnrichmentSuggestion,
    expectedCurrent: string | null
  ) => Promise<boolean>;
  onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
}

const EnrichmentResults = ({
  data,
  control,
  isBusy,
  onApplyVideoSuggestion,
  onApplySuggestion,
  onDismissSuggestion,
}: EnrichmentResultsProps) => (
  <div className="space-y-4">
    {groupArtistSuggestions(data).map(({ artist, suggestions }) => (
      <VideoArtistSuggestionCard
        key={artist.artistId}
        artist={artist}
        suggestions={suggestions}
        isBusy={isBusy}
        onApplySuggestion={onApplySuggestion}
        onDismissSuggestion={onDismissSuggestion}
      />
    ))}
    <VideoLevelSuggestionList
      suggestions={data.suggestions.filter((s) => s.artistId === null)}
      control={control}
      isBusy={isBusy}
      onApplyVideoSuggestion={onApplyVideoSuggestion}
      onDismissSuggestion={onDismissSuggestion}
    />
  </div>
);

/** Terminal-state polite announcement (screen-reader only). */
const TerminalAnnouncement = ({ succeeded }: { succeeded: boolean }): React.ReactElement => (
  <p role="status" aria-live="polite" className="sr-only">
    {succeeded ? 'Enrichment succeeded.' : 'Enrichment failed.'}
  </p>
);

/** Empty-state trigger — the only run affordance that skips the confirm dialog. */
const RunEnrichmentButton = ({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: () => void;
}): React.ReactElement => (
  <Button type="button" disabled={disabled} onClick={onRun}>
    <Sparkles className="size-4" aria-hidden />
    Run enrichment
  </Button>
);

/** Two-line skeleton shown before the first status payload arrives. */
const EnrichmentSkeleton = (): React.ReactElement => (
  <div className="space-y-2" aria-hidden>
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-20 w-full" />
  </div>
);

/** Discriminant over the possible panel phases, computed once. */
type PanelPhase = 'loading' | 'empty' | 'in-flight' | 'failed' | 'succeeded';

const panelPhase = (data: VideoEnrichmentStatusResult | undefined): PanelPhase => {
  if (data === undefined) return 'loading';
  const { status } = data;
  if (status === null) return 'empty';
  if (isInFlightJobStatus(status)) return 'in-flight';
  return status === 'succeeded' ? 'succeeded' : 'failed';
};

interface EnrichmentPanelBodyProps {
  data: VideoEnrichmentStatusResult | undefined;
  control: Control<VideoFormData>;
  isBusy: boolean;
  hasArtist: boolean;
  onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void;
  onRun: () => void;
  onApplySuggestion: (
    suggestion: EnrichmentSuggestion,
    expectedCurrent: string | null
  ) => Promise<boolean>;
  onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
}

interface PhaseContentProps extends EnrichmentPanelBodyProps {
  phase: PanelPhase;
}

/** The single phase-specific block (one branch of the discriminant). */
const PhaseContent = ({
  phase,
  data,
  control,
  isBusy,
  hasArtist,
  onApplyVideoSuggestion,
  onRun,
  onApplySuggestion,
  onDismissSuggestion,
}: PhaseContentProps): React.ReactElement | null => {
  switch (phase) {
    case 'loading':
      return <EnrichmentSkeleton />;
    case 'empty':
      return <RunEnrichmentButton disabled={isRunDisabled(isBusy, hasArtist)} onRun={onRun} />;
    case 'in-flight':
      return <VideoEnrichmentProgressTimeline progress={data?.progress} />;
    case 'failed':
      return data?.error ? <p className="text-destructive text-sm">{data.error}</p> : null;
    case 'succeeded':
      return data === undefined ? null : (
        <EnrichmentResults
          data={data}
          control={control}
          isBusy={isBusy}
          onApplyVideoSuggestion={onApplyVideoSuggestion}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
      );
    default:
      return null;
  }
};

/**
 * State-branch body dispatched on a single {@link panelPhase} discriminant:
 * loading skeleton / empty-state Run / in-flight timeline / failed error +
 * Re-run / succeeded results + Re-run. Extracted from the panel (and split into
 * per-phase parts) to keep every component under the complexity cap.
 */
const EnrichmentPanelBody = (props: EnrichmentPanelBodyProps): React.ReactElement => {
  const { data, isBusy, hasArtist, onRun } = props;
  const phase = panelPhase(data);
  const isTerminal = phase === 'succeeded' || phase === 'failed';

  return (
    <>
      {isTerminal ? <TerminalAnnouncement succeeded={phase === 'succeeded'} /> : null}
      {hasArtist ? null : <MissingArtistHint />}
      <PhaseContent {...props} phase={phase} />
      {isTerminal ? (
        <RerunEnrichmentDialog disabled={isRunDisabled(isBusy, hasArtist)} onConfirm={onRun} />
      ) : null}
    </>
  );
};

/**
 * Admin panel orchestrating the async web-enrichment lifecycle for a MUSIC
 * video: trigger/re-run (re-run behind a confirm dialog), status polling
 * with a 20-minute client give-up (mirroring the bio section's
 * CLIENT_POLL_DEADLINE pattern), a live stage timeline, and per-artist /
 * video-level suggestion review. Artist applies are pessimistic server
 * actions; video-level suggestions apply into the parent form only. Run and
 * Re-run are disabled with a hint while the live Artist / Creator field is
 * blank (the server action refuses blank-artist runs as a backstop).
 */
export const VideoEnrichmentPanel = ({
  videoId,
  control,
  onApplyVideoSuggestion,
}: VideoEnrichmentPanelProps): React.ReactElement => {
  const [gaveUp, setGaveUp] = useState(false);
  const { data } = useVideoEnrichmentStatusQuery(videoId, { enabled: !gaveUp });
  const { runVideoEnrichment, isRunningVideoEnrichment } = useRunVideoEnrichmentMutation(videoId);
  const { applyVideoSuggestion, applyVideoSuggestionAsync, isApplyingVideoSuggestion } =
    useApplyVideoSuggestionMutation(videoId);

  const status = data?.status ?? null;
  const isInFlight = isInFlightJobStatus(status);
  const isBusy = isRunningVideoEnrichment || isApplyingVideoSuggestion;

  const artistValue = useWatch({ control, name: 'artist' });
  const hasArtist = hasEnrichableArtist(artistValue);

  // Last-resort client stop: if a run never reaches a terminal status, stop
  // polling after the deadline (the server's stale-job coercion normally
  // flips the job to `failed` well before this fires).
  useEffect(() => {
    if (!isInFlight || gaveUp) return;
    const timeoutId = setTimeout(() => {
      toast.error(STALE_JOB_TIMEOUT_MESSAGE);
      setGaveUp(true);
    }, CLIENT_POLL_DEADLINE_MS);
    return () => clearTimeout(timeoutId);
  }, [isInFlight, gaveUp]);

  const triggerRun = useCallback((): void => {
    setGaveUp(false);
    runVideoEnrichment();
  }, [runVideoEnrichment]);

  const applySuggestion = useCallback(
    async (suggestion: EnrichmentSuggestion, expectedCurrent: string | null): Promise<boolean> => {
      try {
        const result = await applyVideoSuggestionAsync({
          suggestionId: suggestion.id,
          op: 'apply',
          expectedCurrent,
        });
        return result.success;
      } catch {
        return false;
      }
    },
    [applyVideoSuggestionAsync]
  );

  const dismissSuggestion = useCallback(
    (suggestion: EnrichmentSuggestion): void =>
      applyVideoSuggestion({ suggestionId: suggestion.id, op: 'dismiss' }),
    [applyVideoSuggestion]
  );

  return (
    <section data-testid="video-enrichment-panel" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="text-primary size-5" aria-hidden />
        <h2 className="font-semibold">Web Enrichment</h2>
        {data !== undefined ? <VideoEnrichmentStatusChip status={status} /> : null}
      </div>

      <EnrichmentPanelBody
        data={data}
        control={control}
        isBusy={isBusy}
        hasArtist={hasArtist}
        onApplyVideoSuggestion={onApplyVideoSuggestion}
        onRun={triggerRun}
        onApplySuggestion={applySuggestion}
        onDismissSuggestion={dismissSuggestion}
      />
    </section>
  );
};
