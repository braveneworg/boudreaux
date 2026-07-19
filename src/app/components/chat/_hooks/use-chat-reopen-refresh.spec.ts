// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { queryKeys } from '@/lib/query-keys';

import { useChatReopenRefresh } from './use-chat-reopen-refresh';

const buildHarness = (): {
  client: QueryClient;
  invalidateSpy: ReturnType<typeof vi.spyOn>;
  wrapper: ({ children }: { children: ReactNode }) => React.ReactElement;
} => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, invalidateSpy, wrapper };
};

/** Minimal page stub — the hook only shuffles page references. */
const page = (id: string): { messages: { id: string }[] } => ({ messages: [{ id }] });

describe('useChatReopenRefresh', () => {
  it('does nothing when there is no cached chat history (first open)', () => {
    const { client, invalidateSpy, wrapper } = buildHarness();

    renderHook(() => useChatReopenRefresh({ enabled: true }), { wrapper });

    expect(client.getQueryData(queryKeys.chat.messages())).toBeUndefined();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('trims a multi-page cache to the newest page and invalidates messages + pinned', () => {
    const { client, invalidateSpy, wrapper } = buildHarness();
    client.setQueryData(queryKeys.chat.messages(), {
      pages: [page('new'), page('mid'), page('old')],
      pageParams: [undefined, 'cursor-2', 'cursor-3'],
    });

    renderHook(() => useChatReopenRefresh({ enabled: true }), { wrapper });

    expect(client.getQueryData(queryKeys.chat.messages())).toEqual({
      pages: [page('new')],
      pageParams: [undefined],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.messages() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.pinned() });
  });

  it('leaves a single-page cache untouched (same reference) but still invalidates', () => {
    const { client, invalidateSpy, wrapper } = buildHarness();
    const initial = { pages: [page('new')], pageParams: [undefined] };
    client.setQueryData(queryKeys.chat.messages(), initial);

    renderHook(() => useChatReopenRefresh({ enabled: true }), { wrapper });

    expect(client.getQueryData(queryKeys.chat.messages())).toBe(initial);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.messages() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.pinned() });
  });

  it('does nothing while disabled, then refreshes once enabled', () => {
    const { client, invalidateSpy, wrapper } = buildHarness();
    client.setQueryData(queryKeys.chat.messages(), {
      pages: [page('new'), page('old')],
      pageParams: [undefined, 'cursor-2'],
    });

    const { rerender } = renderHook(({ enabled }) => useChatReopenRefresh({ enabled }), {
      wrapper,
      initialProps: { enabled: false },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    rerender({ enabled: true });

    expect(client.getQueryData(queryKeys.chat.messages())).toEqual({
      pages: [page('new')],
      pageParams: [undefined],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.messages() });
  });

  it('refreshes only once per mount', () => {
    const { client, invalidateSpy, wrapper } = buildHarness();
    client.setQueryData(queryKeys.chat.messages(), {
      pages: [page('new')],
      pageParams: [undefined],
    });

    const { rerender } = renderHook(({ enabled }) => useChatReopenRefresh({ enabled }), {
      wrapper,
      initialProps: { enabled: true },
    });
    rerender({ enabled: true });
    rerender({ enabled: true });

    // One messages + one pinned invalidation — never repeated on re-renders.
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });
});
