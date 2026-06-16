/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect } from 'react';
import type { RefObject } from 'react';

/** Options controlling when {@link useInfiniteScroll} fetches the next page. */
export interface UseInfiniteScrollOptions {
  /** Whether more pages exist to load (from a TanStack `useInfiniteQuery`). */
  hasNextPage: boolean | undefined;
  /** Whether the next page is currently being fetched. */
  isFetchingNextPage: boolean;
  /** Loads the next page when the sentinel enters the viewport. */
  fetchNextPage: () => void;
  /** Distance from the viewport at which to trigger the fetch. Defaults to `'200px'`. */
  rootMargin?: string;
  /** When `false`, the observer is not attached. Defaults to `true`. */
  enabled?: boolean;
}

/**
 * Attaches an `IntersectionObserver` to a sentinel element and calls
 * `fetchNextPage` when it scrolls into view, implementing infinite scroll for a
 * TanStack `useInfiniteQuery`.
 *
 * Centralizes the observer wiring previously duplicated across admin views. The
 * observer is recreated whenever paging state changes and is disconnected on
 * cleanup; it never fires while a page is already loading or when no further
 * pages remain.
 *
 * @param ref - Ref to the sentinel element rendered at the end of the list.
 * @param options - Paging state and behavior — see {@link UseInfiniteScrollOptions}.
 */
export const useInfiniteScroll = (
  ref: RefObject<HTMLElement | null>,
  {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin = '200px',
    enabled = true,
  }: UseInfiniteScrollOptions
): void => {
  useEffect(() => {
    // SSR / non-DOM environments have no IntersectionObserver.
    if (typeof globalThis.IntersectionObserver === 'undefined') return;

    const sentinel = ref.current;
    if (!enabled || !sentinel || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [ref, hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin, enabled]);
};
