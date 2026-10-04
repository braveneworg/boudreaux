/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  type AsyncJobStatus,
  CLIENT_POLL_DEADLINE_MS,
  isInFlightJobStatus,
  STALE_JOB_TIMEOUT_MESSAGE,
} from '@/utils/async-job-lifecycle';

/** The part of a polled status response the tracker reads. */
export interface JobRunStatus {
  status: AsyncJobStatus | null;
  error?: string | null;
}

/** The slice of the status query the tracker needs: the latest data and a way to re-read it now. */
export interface JobRunQuery<T extends JobRunStatus> {
  data: T | undefined;
  refetch: () => Promise<unknown>;
}

export interface UseJobRunOptions<T extends JobRunStatus> {
  query: JobRunQuery<T>;
  /** Starts the job server-side; a refusal carries its reason. */
  trigger: () => Promise<{ success: boolean; error?: string }>;
  /** Receives the terminal `succeeded` status once per run. */
  onSucceeded: (data: T) => void;
  /** Receives one message per failed run, refused trigger, or client deadline. */
  onFailed: (message: string) => void;
  /** Copy for a failed run that carries no message of its own. */
  defaultFailure: string;
}

export interface JobRun {
  /** True from trigger (or from finding a run in flight) until the outcome has been surfaced. */
  busy: boolean;
  /** Triggers the job and tracks the run it started. */
  start: () => Promise<void>;
}

/**
 * The client half of the async job lifecycle: tracks ONE run from its trigger
 * to ONE surfaced outcome. The status query's key is shared with other
 * observers on the page, so when a run starts the cache may still hold the
 * previous run's terminal state; `start` re-reads the status before tracking
 * so that state is never surfaced as this run's. A run found in flight on
 * mount (reload during a job) is tracked too; a terminal state found on
 * mount is not. If no terminal state arrives before the client deadline the
 * run is given up with the shared timeout copy.
 */
export const useJobRun = <T extends JobRunStatus>({
  query,
  trigger,
  onSucceeded,
  onFailed,
  defaultFailure,
}: UseJobRunOptions<T>): JobRun => {
  const [active, setActive] = useState(false);
  const { data, refetch } = query;
  const inFlight = isInFlightJobStatus(data?.status);

  useEffect(() => {
    if (inFlight) setActive(true);
  }, [inFlight]);

  useEffect(() => {
    if (!active || inFlight || !data) return;
    if (data.status === 'succeeded') {
      onSucceeded(data);
      setActive(false);
    } else if (data.status === 'failed') {
      onFailed(data.error || defaultFailure);
      setActive(false);
    }
  }, [active, inFlight, data, onSucceeded, onFailed, defaultFailure]);

  useEffect(() => {
    if (!active) return;
    const timeoutId = setTimeout(() => {
      onFailed(STALE_JOB_TIMEOUT_MESSAGE);
      setActive(false);
    }, CLIENT_POLL_DEADLINE_MS);
    return () => clearTimeout(timeoutId);
  }, [active, onFailed]);

  const start = useCallback(async (): Promise<void> => {
    const response = await trigger();
    if (!response.success) {
      onFailed(response.error || defaultFailure);
      return;
    }
    await refetch();
    setActive(true);
  }, [trigger, refetch, onFailed, defaultFailure]);

  return { busy: active, start };
};
