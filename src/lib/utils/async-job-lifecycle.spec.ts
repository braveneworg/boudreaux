/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ASYNC_JOB_STATUSES,
  blocksNewTrigger,
  CLIENT_POLL_DEADLINE_MS,
  isInFlightJobStatus,
  isStaleJob,
  resolveStaleJobView,
  runnerShouldSkip,
  STALE_JOB_MS,
  STALE_JOB_TIMEOUT_MESSAGE,
  toAsyncJobStatus,
} from './async-job-lifecycle';

describe('ASYNC_JOB_STATUSES', () => {
  it('is the four-state lifecycle union in order', () => {
    expect(ASYNC_JOB_STATUSES).toEqual(['pending', 'processing', 'succeeded', 'failed']);
  });
});

describe('toAsyncJobStatus', () => {
  it('narrows each lifecycle value to itself', () => {
    for (const status of ASYNC_JOB_STATUSES) {
      expect(toAsyncJobStatus(status)).toBe(status);
    }
  });

  it('reads an unknown stored string as null', () => {
    expect(toAsyncJobStatus('exploded')).toBeNull();
  });

  it('reads null as null', () => {
    expect(toAsyncJobStatus(null)).toBeNull();
  });

  it('reads undefined as null', () => {
    expect(toAsyncJobStatus(undefined)).toBeNull();
  });
});

describe('isInFlightJobStatus', () => {
  it('treats pending as in flight', () => {
    expect(isInFlightJobStatus('pending')).toBe(true);
  });

  it('treats processing as in flight', () => {
    expect(isInFlightJobStatus('processing')).toBe(true);
  });

  it('treats succeeded as settled', () => {
    expect(isInFlightJobStatus('succeeded')).toBe(false);
  });

  it('treats failed as settled', () => {
    expect(isInFlightJobStatus('failed')).toBe(false);
  });

  it('treats a never-run job (null) as settled', () => {
    expect(isInFlightJobStatus(null)).toBe(false);
  });
});

describe('isStaleJob', () => {
  it('treats a job started just now as live', () => {
    expect(isStaleJob(new Date(), STALE_JOB_MS)).toBe(false);
  });

  it('treats a job started within the window as live', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS - 60_000));

    expect(isStaleJob(startedAt, STALE_JOB_MS)).toBe(false);
  });

  it('treats a job older than the window as stale', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));

    expect(isStaleJob(startedAt, STALE_JOB_MS)).toBe(true);
  });

  it('treats a job exactly at the window boundary as live', () => {
    const startedAt = new Date(Date.now() - STALE_JOB_MS);

    expect(isStaleJob(startedAt, STALE_JOB_MS)).toBe(false);
  });

  /**
   * The divergence the shared predicate exists to remove. Trigger paths used
   * `startedAt?.getTime() ?? 0` (missing start => stale, retry allowed) while
   * status-read paths used `startedAtMs !== undefined` (missing start => alive,
   * UI polls until its deadline). A job with no recorded start cannot be shown
   * to be running, so it must read as stale — failing toward recovery rather
   * than toward a hang.
   */
  it('treats a job with no recorded start as stale', () => {
    expect(isStaleJob(null, STALE_JOB_MS)).toBe(true);
  });

  it('treats an undefined start as stale', () => {
    expect(isStaleJob(undefined, STALE_JOB_MS)).toBe(true);
  });
});

describe('blocksNewTrigger', () => {
  it('blocks while a fresh job is pending — a queued job is a job', () => {
    expect(blocksNewTrigger('pending', new Date())).toBe(true);
  });

  it('blocks while a fresh job is processing', () => {
    expect(blocksNewTrigger('processing', new Date())).toBe(true);
  });

  it('lets a new trigger supersede a stale pending job', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));

    expect(blocksNewTrigger('pending', startedAt)).toBe(false);
  });

  it('lets a new trigger supersede a stale processing job', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));

    expect(blocksNewTrigger('processing', startedAt)).toBe(false);
  });

  it('lets a new trigger supersede an in-flight job with no recorded start', () => {
    expect(blocksNewTrigger('pending', null)).toBe(false);
  });

  it('never blocks on a succeeded job', () => {
    expect(blocksNewTrigger('succeeded', new Date())).toBe(false);
  });

  it('never blocks on a failed job', () => {
    expect(blocksNewTrigger('failed', new Date())).toBe(false);
  });

  it('never blocks on a never-run job', () => {
    expect(blocksNewTrigger(null, null)).toBe(false);
  });
});

describe('runnerShouldSkip', () => {
  it('skips while a fresh job is already processing', () => {
    expect(runnerShouldSkip('processing', new Date())).toBe(true);
  });

  /**
   * The deliberate difference from blocksNewTrigger: `pending` is the handoff
   * the runner exists to consume. If pending blocked the runner too, the
   * trigger's own pending write would deadlock every run.
   */
  it('does not skip on a fresh pending job — pending is the handoff', () => {
    expect(runnerShouldSkip('pending', new Date())).toBe(false);
  });

  it('does not skip on a stale processing job', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));

    expect(runnerShouldSkip('processing', startedAt)).toBe(false);
  });

  it('does not skip on a settled job', () => {
    expect(runnerShouldSkip('succeeded', new Date())).toBe(false);
  });

  it('does not skip on a never-run job', () => {
    expect(runnerShouldSkip(null, null)).toBe(false);
  });
});

describe('resolveStaleJobView', () => {
  it('coerces a stale pending job to failed with the timeout copy', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));

    expect(resolveStaleJobView({ status: 'pending', startedAt, error: null })).toEqual({
      status: 'failed',
      error: STALE_JOB_TIMEOUT_MESSAGE,
    });
  });

  it('coerces a stale processing job to failed with the timeout copy', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));

    expect(resolveStaleJobView({ status: 'processing', startedAt, error: null })).toEqual({
      status: 'failed',
      error: STALE_JOB_TIMEOUT_MESSAGE,
    });
  });

  it('passes a fresh in-flight job through untouched', () => {
    expect(
      resolveStaleJobView({ status: 'processing', startedAt: new Date(), error: null })
    ).toEqual({ status: 'processing', error: null });
  });

  it('passes a terminal status through with its stored error', () => {
    expect(resolveStaleJobView({ status: 'failed', startedAt: null, error: 'boom' })).toEqual({
      status: 'failed',
      error: 'boom',
    });
  });

  it('passes a never-run job through as null', () => {
    expect(resolveStaleJobView({ status: null, startedAt: null, error: null })).toEqual({
      status: null,
      error: null,
    });
  });

  it('does not persist the coercion — it is a read-time view', () => {
    const startedAt = new Date(Date.now() - (STALE_JOB_MS + 60_000));
    const state = { status: 'pending' as const, startedAt, error: null };

    resolveStaleJobView(state);

    expect(state.status).toBe('pending');
  });
});

describe('lifecycle constants', () => {
  it('keeps the stale window above the 15-minute Lambda timeout', () => {
    expect(STALE_JOB_MS).toBeGreaterThan(15 * 60 * 1000);
  });

  it('keeps the client poll deadline above the stale window so the server coercion resolves the UI first', () => {
    expect(CLIENT_POLL_DEADLINE_MS).toBeGreaterThan(STALE_JOB_MS);
  });

  it('exports the timeout copy once for client and server', () => {
    expect(STALE_JOB_TIMEOUT_MESSAGE).toBe('Job timed out. Please try again.');
  });
});
