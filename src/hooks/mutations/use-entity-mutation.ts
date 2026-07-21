/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutateAsyncFunction,
  type UseMutateFunction,
} from '@tanstack/react-query';

/**
 * The one fact every entity action result carries. Server Actions in this
 * codebase resolve with a `success` flag rather than throwing on a business
 * failure, so a settled promise is not on its own evidence that the mutation
 * did anything — the flag is what the cache policy reads.
 */
interface EntityActionResult {
  success: boolean;
}

/**
 * Invalidate every cached surface one entity's mutations can affect.
 *
 * Takes the query client as an argument instead of closing over it so each
 * entity module can declare its cache policy as a plain function next to the
 * hooks that share it — the artist→release cascade and the video probe-prefill
 * exclusion are both expressed this way.
 */
export type InvalidateEntityQueries = (queryClient: QueryClient) => Promise<unknown>;

/**
 * What an entity mutation hook exposes. Deliberately narrower than TanStack's
 * result: `isError`, `error`, `data`, and `reset` are omitted because no call
 * site reads them — failures travel in the resolved result's `success`/`error`
 * fields, not in TanStack's error channel.
 */
export interface EntityMutation<TResult, TVariables> {
  mutate: UseMutateFunction<TResult, Error, TVariables>;
  mutateAsync: UseMutateAsyncFunction<TResult, Error, TVariables>;
  isPending: boolean;
}

/**
 * Shared lifecycle for every entity mutation: run the action, and refresh the
 * entity's caches only when the action reports success.
 *
 * Each named hook (`usePublishVideoMutation`, `useDeleteReleaseMutation`, …)
 * supplies the action and its entity's invalidation policy, then renames the
 * three returned members so a component holding several mutations reads
 * unambiguously — `isPublishingVideo` rather than a third colliding `isPending`.
 */
export const useEntityMutation = <TResult extends EntityActionResult, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  invalidate: InvalidateEntityQueries
): EntityMutation<TResult, TVariables> => {
  const queryClient = useQueryClient();
  const { mutate, mutateAsync, isPending } = useMutation<TResult, Error, TVariables>({
    mutationFn,
    onSuccess: (result) => (result.success ? invalidate(queryClient) : undefined),
  });

  return { mutate, mutateAsync, isPending };
};
