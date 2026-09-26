// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { StrictMode, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { useDebounce } from '@/hooks/use-debounce';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import {
  RELEASE_DATE_LOOKUP_DEBOUNCE_MS,
  useReleaseDateAutoLookup,
  type Scheduler,
  type UseReleaseDateAutoLookupArgs,
} from './use-release-date-auto-lookup';

import type { VideoUploadStatus } from './use-video-upload';

vi.mock('server-only', () => ({}));

const mockRefetch = vi.hoisted(() => vi.fn());
vi.mock('../_hooks/use-release-date-lookup-query', () => ({
  useReleaseDateLookupQuery: vi.fn(() => ({
    isFetching: false,
    error: null,
    data: undefined,
    refetch: mockRefetch,
  })),
}));

// Pass-through debounce: the hook's timing is driven by the manual scheduler.
vi.mock('@/hooks/use-debounce', () => ({ useDebounce: vi.fn((value: unknown) => value) }));

/** A scheduler whose timers only fire when a test flushes them. */
interface ManualScheduler {
  scheduler: Scheduler;
  /** Fire the oldest live timer (inside act); returns its delay, or null. */
  flushNext: () => Promise<number | null>;
  /** Delays of the timers still armed. */
  pendingDelays: () => number[];
}

const createManualScheduler = (): ManualScheduler => {
  const queue: Array<{ fn: () => void; delayMs: number; cancelled: boolean }> = [];
  return {
    scheduler: {
      schedule: (fn, delayMs) => {
        const entry = { fn, delayMs, cancelled: false };
        queue.push(entry);
        return () => {
          entry.cancelled = true;
        };
      },
    },
    flushNext: async () => {
      const entry = queue.shift();
      while (entry && entry.cancelled) return null;
      if (!entry) return null;
      await act(async () => {
        entry.fn();
      });
      return entry.delayMs;
    },
    pendingDelays: () => queue.filter((entry) => !entry.cancelled).map((entry) => entry.delayMs),
  };
};

/** A refetch result the mocked query resolves with. */
const found = (releasedOn: string) => ({ data: { releasedOn, confidence: 'high', sources: [] } });
const miss = { data: null };

const FIXED_NOW = (): Date => new Date('2026-09-14T12:00:00.000Z');

interface HarnessOptions {
  uploadStatus?: VideoUploadStatus;
  hasPersistedRow?: boolean;
  category?: string;
  title?: string;
  artist?: string;
  releasedOn?: string;
  now?: () => Date;
  strict?: boolean;
}

const renderLookup = (options: HarnessOptions = {}) => {
  const manual = createManualScheduler();
  const queryClient = new QueryClient();
  const {
    uploadStatus = 'uploading',
    hasPersistedRow = false,
    category = 'MUSIC',
    title = 'My Bad',
    artist = 'Ceschi',
    releasedOn = '',
    now = FIXED_NOW,
    strict = false,
  } = options;
  let formRef: UseFormReturn<VideoFormData> | undefined;
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  const hook = renderHook(
    (
      props: Pick<UseReleaseDateAutoLookupArgs, 'uploadStatus' | 'hasPersistedRow' | 'category'>
    ) => {
      const form = useForm<VideoFormData>({
        defaultValues: { title, artist, releasedOn, category: 'MUSIC', description: '' },
      });
      formRef = form;
      const lookup = useReleaseDateAutoLookup({
        form,
        ...props,
        scheduler: manual.scheduler,
        now,
      });
      // Read dirtyFields during render so the proxy tracks it for assertions.
      return { ...lookup, releasedOnDirty: Boolean(form.formState.dirtyFields.releasedOn) };
    },
    { initialProps: { uploadStatus, hasPersistedRow, category }, wrapper: Wrapper }
  );
  const getForm = (): UseFormReturn<VideoFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };
  return { ...hook, ...manual, getForm };
};

beforeEach(() => {
  mockRefetch.mockReset();
  mockRefetch.mockResolvedValue(miss);
});

describe('useReleaseDateAutoLookup — gate', () => {
  it('does nothing before a file is chosen', async () => {
    const { pendingDelays, result } = renderLookup({ uploadStatus: 'idle' });

    await act(async () => {});

    expect(pendingDelays()).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('does nothing while the file is being prepared', async () => {
    const { pendingDelays } = renderLookup({ uploadStatus: 'preparing' });

    await act(async () => {});

    expect(pendingDelays()).toEqual([]);
  });

  it('never runs for an informational video', async () => {
    const { pendingDelays } = renderLookup({ category: 'INFORMATIONAL' });

    await act(async () => {});

    expect(pendingDelays()).toEqual([]);
  });

  it('never runs when the date is already set', async () => {
    const { pendingDelays } = renderLookup({ releasedOn: '2001-01-01' });

    await act(async () => {});

    expect(pendingDelays()).toEqual([]);
  });

  it('arms the first attempt immediately once the upload starts', async () => {
    const { pendingDelays } = renderLookup({ uploadStatus: 'uploading' });

    await act(async () => {});

    expect(pendingDelays()).toEqual([0]);
  });

  it('runs on edit-open of a persisted row with an empty date', async () => {
    const { pendingDelays } = renderLookup({ uploadStatus: 'idle', hasPersistedRow: true });

    await act(async () => {});

    expect(pendingDelays()).toEqual([0]);
  });

  it('debounces the pair with the module constant', () => {
    renderLookup();

    expect(vi.mocked(useDebounce)).toHaveBeenCalledWith('My Bad', RELEASE_DATE_LOOKUP_DEBOUNCE_MS);
  });
});

describe('useReleaseDateAutoLookup — a find', () => {
  it('fills the empty field with the found day', async () => {
    mockRefetch.mockResolvedValueOnce(found('2019-08-04'));
    const { flushNext, getForm } = renderLookup();

    await flushNext();

    expect(getForm().getValues('releasedOn')).toBe('2019-08-04');
  });

  it('marks the filled field dirty so a later row reset cannot wipe it', async () => {
    mockRefetch.mockResolvedValueOnce(found('2019-08-04'));
    const { flushNext, result } = renderLookup();

    await flushNext();

    expect(result.current.releasedOnDirty).toBe(true);
  });

  it('reports found once the lookup lands a date', async () => {
    mockRefetch.mockResolvedValueOnce(found('2019-08-04'));
    const { flushNext, result } = renderLookup();

    await flushNext();

    expect(result.current.status).toBe('found');
  });

  it('reports searching while an attempt is on the wire', async () => {
    mockRefetch.mockImplementationOnce(() => new Promise(() => undefined));
    const { flushNext, result } = renderLookup();

    await flushNext();

    expect(result.current.status).toBe('searching');
  });

  it('never overwrites a date typed while the attempt was in flight', async () => {
    let resolveLookup: (value: unknown) => void = () => undefined;
    mockRefetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        })
    );
    const { flushNext, getForm, result } = renderLookup();
    await flushNext();

    await act(async () => {
      getForm().setValue('releasedOn', '2001-01-01', { shouldDirty: true });
    });
    await act(async () => {
      resolveLookup(found('2019-08-04'));
    });

    expect(getForm().getValues('releasedOn')).toBe('2001-01-01');
    expect(result.current.status).toBe('idle');
  });

  it('drops the searching hint when the upload fails before a row exists', async () => {
    mockRefetch.mockImplementationOnce(() => new Promise(() => undefined));
    const { flushNext, rerender, result } = renderLookup();
    await flushNext();

    rerender({ uploadStatus: 'error', hasPersistedRow: false, category: 'MUSIC' });

    expect(result.current.status).toBe('idle');
  });

  it("treats a result equal to today's UTC day as a miss", async () => {
    mockRefetch.mockResolvedValueOnce(found('2026-09-14'));
    const { flushNext, getForm, pendingDelays } = renderLookup();

    await flushNext();

    expect(getForm().getValues('releasedOn')).toBe('');
    expect(pendingDelays()).toEqual([20_000]);
  });
});

describe('useReleaseDateAutoLookup — the budget', () => {
  it('retries after 20s then 60s, then gives up after exactly three attempts', async () => {
    const { flushNext, result, pendingDelays } = renderLookup();

    const delays = [await flushNext(), await flushNext(), await flushNext()];

    expect(delays).toEqual([0, 20_000, 60_000]);
    expect(mockRefetch).toHaveBeenCalledTimes(3);
    expect(pendingDelays()).toEqual([]);
    expect(result.current.status).toBe('exhausted');
  });

  it('counts a rejected attempt against the budget', async () => {
    mockRefetch.mockRejectedValueOnce(new Error('network'));
    const { flushNext, pendingDelays } = renderLookup();

    await flushNext();

    expect(pendingDelays()).toEqual([20_000]);
  });

  it('stops early on a find', async () => {
    mockRefetch.mockResolvedValueOnce(miss).mockResolvedValueOnce(found('2019-08-04'));
    const { flushNext, pendingDelays } = renderLookup();

    await flushNext();
    await flushNext();

    expect(mockRefetch).toHaveBeenCalledTimes(2);
    expect(pendingDelays()).toEqual([]);
  });

  it('hides the exhausted hint once a date is set by hand', async () => {
    const { flushNext, getForm, result } = renderLookup();
    await flushNext();
    await flushNext();
    await flushNext();

    await act(async () => {
      getForm().setValue('releasedOn', '2001-01-01', { shouldDirty: true });
    });

    expect(result.current.status).toBe('idle');
  });
});

describe('useReleaseDateAutoLookup — pair changes and lifecycle', () => {
  it('cancels the armed timer when the pair changes', async () => {
    const { getForm, pendingDelays } = renderLookup();
    await act(async () => {});

    await act(async () => {
      getForm().setValue('title', 'Other Song');
    });

    // The old pair's timer is cancelled; the new pair arms its own first attempt.
    expect(pendingDelays()).toEqual([0]);
  });

  it('discards a stale result from the previous pair', async () => {
    let resolveLookup: (value: unknown) => void = () => undefined;
    mockRefetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        })
    );
    const { flushNext, getForm } = renderLookup();
    await flushNext();

    await act(async () => {
      getForm().setValue('title', 'Other Song');
    });
    await act(async () => {
      resolveLookup(found('2019-08-04'));
    });

    expect(getForm().getValues('releasedOn')).toBe('');
  });

  it('gives the new pair a fresh budget', async () => {
    const { flushNext, getForm, pendingDelays } = renderLookup();
    await flushNext();
    await flushNext();
    await flushNext();

    await act(async () => {
      getForm().setValue('artist', 'Someone Else');
    });

    expect(pendingDelays()).toEqual([0]);
  });

  it('reads idle for a pair that has not resolved, even after another did', async () => {
    const { flushNext, getForm, result } = renderLookup();
    await flushNext();
    await flushNext();
    await flushNext();

    await act(async () => {
      getForm().setValue('artist', 'Someone Else');
    });

    expect(result.current.status).toBe('idle');
  });

  it('shows the exhausted hint again when the admin edits back to that pair', async () => {
    const { flushNext, getForm, result } = renderLookup();
    await flushNext();
    await flushNext();
    await flushNext();

    await act(async () => {
      getForm().setValue('artist', 'Someone Else');
    });
    // The other pair's first attempt fires (a miss) before the admin edits back.
    await flushNext();
    await act(async () => {
      getForm().setValue('artist', 'Ceschi');
    });

    expect(result.current.status).toBe('exhausted');
  });

  it('cancels the armed timer on unmount', async () => {
    const { unmount, pendingDelays } = renderLookup();
    await act(async () => {});

    unmount();

    expect(pendingDelays()).toEqual([]);
  });

  it('spends one attempt, not two, under StrictMode double effects', async () => {
    const { flushNext, pendingDelays } = renderLookup({ strict: true });
    await act(async () => {});

    expect(pendingDelays()).toEqual([0]);
    await flushNext();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
