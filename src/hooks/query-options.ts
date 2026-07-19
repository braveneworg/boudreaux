/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseQueryOptions,
} from '@tanstack/react-query';

/**
 * Caller-supplied overrides for a hook that wraps `useQuery`.
 *
 * Accepts every TanStack `useQuery` option except `queryKey` and `queryFn`,
 * which each hook owns. Spread last into the hook's `useQuery` call so a caller
 * can override defaults such as `staleTime`, `enabled`, or `refetchOnWindowFocus`
 * without being able to clobber the query's identity.
 *
 * @typeParam TQueryFnData - The shape the `queryFn` resolves to.
 * @typeParam TData - The shape exposed to consumers after any `select`;
 * defaults to `TQueryFnData`.
 * @typeParam TError - The error type; defaults to `Error`.
 */
export type QueryOptionsOverride<TQueryFnData, TData = TQueryFnData, TError = Error> = Partial<
  Omit<UseQueryOptions<TQueryFnData, TError, TData>, 'queryKey' | 'queryFn'>
>;

/**
 * Caller-supplied overrides for a hook that wraps `useInfiniteQuery`.
 *
 * Accepts every TanStack `useInfiniteQuery` option except the four each hook
 * owns: `queryKey`, `queryFn`, `initialPageParam`, and `getNextPageParam`.
 * Spread last into the hook's `useInfiniteQuery` call so a caller can override
 * defaults such as `staleTime` or `enabled` while pagination stays locked.
 *
 * @typeParam TQueryFnData - The shape of a single page of data.
 * @typeParam TPageParam - The page-cursor type; defaults to `number`.
 * @typeParam TError - The error type; defaults to `Error`.
 */
export type InfiniteQueryOptionsOverride<
  TQueryFnData,
  TPageParam = number,
  TError = Error,
> = Partial<
  Omit<
    UseInfiniteQueryOptions<TQueryFnData, TError, InfiniteData<TQueryFnData>, QueryKey, TPageParam>,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'
  >
>;
