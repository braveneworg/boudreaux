/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { applyVideoSuggestionAction } from '@/lib/actions/apply-video-suggestion-action';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { runVideoEnrichmentAction } from '@/lib/actions/run-video-enrichment-action';
import { queryKeys } from '@/lib/query-keys';

/**
 * Input for one suggestion apply/dismiss. `releasedOn` suggestions must NEVER
 * be sent with `op: 'apply'` (the server rejects them) — the release date is
 * applied into the RHF form instead; dismiss is allowed.
 */
export interface ApplyVideoSuggestionInput {
  suggestionId: string;
  op: 'apply' | 'dismiss';
  expectedCurrent?: string | null;
}

interface UseRunVideoEnrichmentMutationResult {
  /** Triggers (or re-triggers) the async enrichment job for the video. */
  runVideoEnrichment: () => void;
  /** True while the trigger action is in flight. */
  isRunningVideoEnrichment: boolean;
}

interface UseApplyVideoSuggestionMutationResult {
  /** Applies or dismisses one suggestion (fire-and-forget). */
  applyVideoSuggestion: (input: ApplyVideoSuggestionInput) => void;
  /** Awaitable variant used by Apply-all's sequential stop-on-first-failure loop. */
  applyVideoSuggestionAsync: (input: ApplyVideoSuggestionInput) => Promise<AdminActionResult>;
  /** True while any apply/dismiss is in flight. */
  isApplyingVideoSuggestion: boolean;
}

/**
 * Mutation hook wrapping {@link runVideoEnrichmentAction}. On a successful
 * trigger it invalidates ONLY the enrichment status query so polling picks up
 * the server-set `pending` state. It deliberately never touches
 * `queryKeys.videos.detail` / `videos.all`: a `videos.detail` refetch re-runs
 * `form.reset` in the mounted video form and would wipe dirty edits. A failed
 * result surfaces as an error toast.
 *
 * @param videoId - The video whose enrichment cache to invalidate.
 */
export const useRunVideoEnrichmentMutation = (
  videoId: string
): UseRunVideoEnrichmentMutationResult => {
  const queryClient = useQueryClient();
  const { mutate: runVideoEnrichment, isPending: isRunningVideoEnrichment } = useMutation<
    AdminActionResult,
    Error,
    void
  >({
    mutationFn: () => runVideoEnrichmentAction(videoId),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to start enrichment');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos.enrichment(videoId) });
    },
  });

  return { runVideoEnrichment, isRunningVideoEnrichment };
};

/**
 * Mutation hook wrapping {@link applyVideoSuggestionAction} (pessimistic — the
 * UI only flips state from the refetched status). A successful `apply`
 * invalidates the enrichment status query plus `artists.all` (the applied
 * fact changed artist data); a `dismiss` invalidates the enrichment key only.
 * Never invalidates `videos.detail` / `videos.all` (form-reset hazard — see
 * {@link useRunVideoEnrichmentMutation}). A failed result surfaces as an
 * error toast.
 *
 * @param videoId - The video whose enrichment cache to invalidate.
 */
export const useApplyVideoSuggestionMutation = (
  videoId: string
): UseApplyVideoSuggestionMutationResult => {
  const queryClient = useQueryClient();
  const {
    mutate: applyVideoSuggestion,
    mutateAsync: applyVideoSuggestionAsync,
    isPending: isApplyingVideoSuggestion,
  } = useMutation<AdminActionResult, Error, ApplyVideoSuggestionInput>({
    mutationFn: (input) => applyVideoSuggestionAction(input),
    onSuccess: (result, { op }) => {
      if (!result.success) {
        toast.error(result.error ?? 'Failed to update suggestion');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos.enrichment(videoId) });
      if (op === 'apply') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.artists.all });
      }
    },
  });

  return { applyVideoSuggestion, applyVideoSuggestionAsync, isApplyingVideoSuggestion };
};
