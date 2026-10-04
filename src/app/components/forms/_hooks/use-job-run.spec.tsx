/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, renderHook } from '@testing-library/react';

import { CLIENT_POLL_DEADLINE_MS, STALE_JOB_TIMEOUT_MESSAGE } from '@/utils/async-job-lifecycle';

import { useJobRun, type JobRunStatus } from './use-job-run';

type Status = JobRunStatus & { content?: string };

/** A hand-driven stand-in for the status query: the test moves `data` itself. */
const makeHarness = (initial: Status | undefined) => {
  let data = initial;
  const refetch = vi.fn(async () => ({ data }));
  const trigger = vi.fn(async () => ({ success: true as const }));
  const onSucceeded = vi.fn();
  const onFailed = vi.fn();
  const hook = renderHook(() =>
    useJobRun<Status>({
      query: { data, refetch },
      trigger,
      onSucceeded,
      onFailed,
      defaultFailure: 'Job failed.',
    })
  );
  const setData = (next: Status | undefined): void => {
    data = next;
    hook.rerender();
  };
  return { ...hook, setData, refetch, trigger, onSucceeded, onFailed };
};

describe('useJobRun', () => {
  // The defect this guards: the status key is shared, so when a run starts the
  // cache may still hold the PREVIOUS run's terminal state. A tracker that
  // trusts it adopts the old result as this run's outcome.
  it('never surfaces a terminal state read before the trigger as this run’s outcome', async () => {
    const h = makeHarness({ status: 'succeeded', content: 'old' });

    expect(h.onSucceeded).not.toHaveBeenCalled();
    await act(async () => {
      const started = h.result.current.start();
      // `start` refetches before tracking; the refetch reads the new `pending`.
      h.setData({ status: 'pending' });
      await started;
    });

    expect(h.trigger).toHaveBeenCalledTimes(1);
    expect(h.refetch).toHaveBeenCalledTimes(1);
    expect(h.onSucceeded).not.toHaveBeenCalled();
    expect(h.result.current.busy).toBe(true);

    act(() => h.setData({ status: 'succeeded', content: 'new' }));

    expect(h.onSucceeded).toHaveBeenCalledTimes(1);
    expect(h.onSucceeded).toHaveBeenCalledWith({ status: 'succeeded', content: 'new' });
    expect(h.result.current.busy).toBe(false);
  });

  it('surfaces a failed run once, with the job’s own message', async () => {
    const h = makeHarness({ status: null });
    await act(async () => {
      const started = h.result.current.start();
      h.setData({ status: 'processing' });
      await started;
    });

    act(() => h.setData({ status: 'failed', error: 'Model refused' }));
    act(() => h.setData({ status: 'failed', error: 'Model refused' }));

    expect(h.onFailed).toHaveBeenCalledTimes(1);
    expect(h.onFailed).toHaveBeenCalledWith('Model refused');
    expect(h.result.current.busy).toBe(false);
  });

  it('falls back to the default failure copy when the job reports none', async () => {
    const h = makeHarness({ status: null });
    await act(async () => {
      const started = h.result.current.start();
      h.setData({ status: 'processing' });
      await started;
    });

    act(() => h.setData({ status: 'failed', error: null }));

    expect(h.onFailed).toHaveBeenCalledWith('Job failed.');
  });

  it('falls back to the default failure copy when a refused trigger gives no reason', async () => {
    const h = makeHarness({ status: null });
    h.trigger.mockResolvedValueOnce({ success: false } as never);

    await act(async () => {
      await h.result.current.start();
    });

    expect(h.onFailed).toHaveBeenCalledWith('Job failed.');
  });

  it('resumes a run found in flight on mount and surfaces its outcome', () => {
    const h = makeHarness({ status: 'processing' });

    expect(h.result.current.busy).toBe(true);
    act(() => h.setData({ status: 'succeeded', content: 'resumed' }));

    expect(h.onSucceeded).toHaveBeenCalledWith({ status: 'succeeded', content: 'resumed' });
    expect(h.result.current.busy).toBe(false);
  });

  it('does not track a terminal state found on mount', () => {
    const h = makeHarness({ status: 'succeeded', content: 'old' });

    expect(h.result.current.busy).toBe(false);
    expect(h.onSucceeded).not.toHaveBeenCalled();
  });

  it('reports a refused trigger and stays idle', async () => {
    const h = makeHarness({ status: null });
    h.trigger.mockResolvedValueOnce({ success: false, error: 'Already running' } as never);

    await act(async () => {
      await h.result.current.start();
    });

    expect(h.onFailed).toHaveBeenCalledWith('Already running');
    expect(h.refetch).not.toHaveBeenCalled();
    expect(h.result.current.busy).toBe(false);
  });

  it('gives up with the shared timeout copy when no terminal state ever arrives', async () => {
    vi.useFakeTimers();
    try {
      const h = makeHarness({ status: null });
      await act(async () => {
        const started = h.result.current.start();
        h.setData({ status: 'pending' });
        await started;
      });

      act(() => {
        vi.advanceTimersByTime(CLIENT_POLL_DEADLINE_MS);
      });

      expect(h.onFailed).toHaveBeenCalledWith(STALE_JOB_TIMEOUT_MESSAGE);
      expect(h.result.current.busy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
