/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { createRef } from 'react';

import { renderHook } from '@testing-library/react';

import { useInfiniteScroll } from './use-infinite-scroll';

type ObserverCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;

interface ObserverInstance {
  callback: ObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  options?: { rootMargin?: string };
}

const observers: ObserverInstance[] = [];

class MockIntersectionObserver {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve = vi.fn();
  takeRecords = vi.fn();
  root = null;
  rootMargin = '';
  thresholds = [];

  constructor(callback: ObserverCallback, options?: { rootMargin?: string }) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    observers.push({ callback, observe: this.observe, disconnect: this.disconnect, options });
  }
}

const makeRef = () => {
  const ref = createRef<HTMLDivElement>();
  // A detached element is enough — the observer is mocked.
  Object.defineProperty(ref, 'current', { value: document.createElement('div'), writable: true });
  return ref;
};

const triggerIntersect = (isIntersecting: boolean) => {
  const latest = observers.at(-1);
  latest?.callback(
    [{ isIntersecting } as IntersectionObserverEntry],
    latest as unknown as IntersectionObserver
  );
};

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetchNextPage when the sentinel intersects', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll(makeRef(), { hasNextPage: true, isFetchingNextPage: false, fetchNextPage })
    );

    triggerIntersect(true);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not call fetchNextPage when the sentinel is not intersecting', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll(makeRef(), { hasNextPage: true, isFetchingNextPage: false, fetchNextPage })
    );

    triggerIntersect(false);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not attach an observer while a page is already being fetched', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll(makeRef(), { hasNextPage: true, isFetchingNextPage: true, fetchNextPage })
    );

    expect(observers).toHaveLength(0);
  });

  it('does not attach an observer when there is no next page', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll(makeRef(), { hasNextPage: false, isFetchingNextPage: false, fetchNextPage })
    );

    expect(observers).toHaveLength(0);
  });

  it('does not attach an observer when disabled', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll(makeRef(), {
        hasNextPage: true,
        isFetchingNextPage: false,
        fetchNextPage,
        enabled: false,
      })
    );

    expect(observers).toHaveLength(0);
  });

  it('passes the provided rootMargin to the observer', () => {
    const fetchNextPage = vi.fn();
    renderHook(() =>
      useInfiniteScroll(makeRef(), {
        hasNextPage: true,
        isFetchingNextPage: false,
        fetchNextPage,
        rootMargin: '500px',
      })
    );

    expect(observers.at(-1)?.options?.rootMargin).toBe('500px');
  });

  it('disconnects the observer on unmount', () => {
    const fetchNextPage = vi.fn();
    const { unmount } = renderHook(() =>
      useInfiniteScroll(makeRef(), { hasNextPage: true, isFetchingNextPage: false, fetchNextPage })
    );

    unmount();

    expect(observers.at(-1)?.disconnect).toHaveBeenCalled();
  });

  it('no-ops when IntersectionObserver is unavailable (SSR guard)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const fetchNextPage = vi.fn();

    expect(() =>
      renderHook(() =>
        useInfiniteScroll(makeRef(), {
          hasNextPage: true,
          isFetchingNextPage: false,
          fetchNextPage,
        })
      )
    ).not.toThrow();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
