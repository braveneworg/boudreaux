/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Sparkles } from 'lucide-react';
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
} from '@/app/hooks/mutations/use-video-enrichment-mutations';
import { useVideoEnrichmentStatusQuery } from '@/app/hooks/use-video-enrichment-status-query';
import { CLIENT_POLL_DEADLINE_MS } from '@/lib/validation/bio-generation-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { isInFlightEnrichmentStatus } from '@/lib/validation/video-enrichment-schema';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { VideoArtistSuggestionCard } from './video-artist-suggestion-card';
import { VideoEnrichmentProgressTimeline } from './video-enrichment-progress-timeline';
import { VideoEnrichmentStatusChip } from './video-enrichment-status-chip';
import { VideoReleaseDateSuggestion } from './video-release-date-suggestion';

import type { Control } from 'react-hook-form';

type EnrichmentArtist = VideoEnrichmentStatusResult['artists'][number];
type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

interface VideoEnrichmentPanelProps {
  videoId: string;
  control: Control<VideoFormData>;
  /** Applies the release-date suggestion into the parent RHF form. */
  onApplyReleaseDate: (value: string) => void;
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

/** The single video-level release-date suggestion, if the run produced one. */
export const findReleaseDateSuggestion = (
  data: VideoEnrichmentStatusResult
): EnrichmentSuggestion | undefined =>
  data.suggestions.find((s) => s.artistId === null && s.field === 'releasedOn');

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

interface EnrichmentResultsProps {
  data: VideoEnrichmentStatusResult;
  control: Control<VideoFormData>;
  isBusy: boolean;
  onApplyReleaseDate: (value: string) => void;
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
  onApplyReleaseDate,
  onApplySuggestion,
  onDismissSuggestion,
}: EnrichmentResultsProps) => {
  const releaseDateSuggestion = findReleaseDateSuggestion(data);
  return (
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
      {releaseDateSuggestion ? (
        <VideoReleaseDateSuggestion
          suggestion={releaseDateSuggestion}
          control={control}
          name="releasedOn"
          onApplyReleaseDate={onApplyReleaseDate}
          onDismiss={() => onDismissSuggestion(releaseDateSuggestion)}
          isBusy={isBusy}
        />
      ) : null}
    </div>
  );
};

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
  if (isInFlightEnrichmentStatus(status)) return 'in-flight';
  return status === 'succeeded' ? 'succeeded' : 'failed';
};

interface EnrichmentPanelBodyProps {
  data: VideoEnrichmentStatusResult | undefined;
  control: Control<VideoFormData>;
  isBusy: boolean;
  onApplyReleaseDate: (value: string) => void;
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
  onApplyReleaseDate,
  onRun,
  onApplySuggestion,
  onDismissSuggestion,
}: PhaseContentProps): React.ReactElement | null => {
  switch (phase) {
    case 'loading':
      return <EnrichmentSkeleton />;
    case 'empty':
      return <RunEnrichmentButton disabled={isBusy} onRun={onRun} />;
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
          onApplyReleaseDate={onApplyReleaseDate}
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
  const { data, isBusy, onRun } = props;
  const phase = panelPhase(data);
  const isTerminal = phase === 'succeeded' || phase === 'failed';

  return (
    <>
      {isTerminal ? <TerminalAnnouncement succeeded={phase === 'succeeded'} /> : null}
      <PhaseContent {...props} phase={phase} />
      {isTerminal ? <RerunEnrichmentDialog disabled={isBusy} onConfirm={onRun} /> : null}
    </>
  );
};

/**
 * Admin panel orchestrating the async web-enrichment lifecycle for a MUSIC
 * video: trigger/re-run (re-run behind a confirm dialog), status polling
 * with a 20-minute client give-up (mirroring the bio section's
 * CLIENT_POLL_DEADLINE pattern), a live stage timeline, and per-artist /
 * release-date suggestion review. Artist applies are pessimistic server
 * actions; the release date applies into the parent form only.
 */
export const VideoEnrichmentPanel = ({
  videoId,
  control,
  onApplyReleaseDate,
}: VideoEnrichmentPanelProps): React.ReactElement => {
  const [gaveUp, setGaveUp] = useState(false);
  const { data } = useVideoEnrichmentStatusQuery(videoId, { enabled: !gaveUp });
  const { runVideoEnrichment, isRunningVideoEnrichment } = useRunVideoEnrichmentMutation(videoId);
  const { applyVideoSuggestion, applyVideoSuggestionAsync, isApplyingVideoSuggestion } =
    useApplyVideoSuggestionMutation(videoId);

  const status = data?.status ?? null;
  const isInFlight = isInFlightEnrichmentStatus(status);
  const isBusy = isRunningVideoEnrichment || isApplyingVideoSuggestion;

  // Last-resort client stop: if a run never reaches a terminal status, stop
  // polling after the deadline (the server's stale-job coercion normally
  // flips the job to `failed` well before this fires).
  useEffect(() => {
    if (!isInFlight || gaveUp) return;
    const timeoutId = setTimeout(() => {
      toast.error('Enrichment timed out. Re-run to try again.');
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
        onApplyReleaseDate={onApplyReleaseDate}
        onRun={triggerRun}
        onApplySuggestion={applySuggestion}
        onDismissSuggestion={dismissSuggestion}
      />
    </section>
  );
};
