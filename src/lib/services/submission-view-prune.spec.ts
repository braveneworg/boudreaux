/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SubmissionViewEventService } from '@/lib/services/submission-view-event-service';

import { startViewPruneMonitor } from './submission-view-prune';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/submission-view-event-service', () => ({
  SubmissionViewEventService: { prune: vi.fn() },
}));

const errorLog = vi.hoisted(() => vi.fn());
const infoLog = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: errorLog, info: infoLog } },
}));

const NOW = new Date('2026-11-14T15:30:00.000Z');
const HOUR = 3_600_000;

const prune = vi.mocked(SubmissionViewEventService.prune);

describe('startViewPruneMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prune.mockReset();
    prune.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prunes at once and then every hour, until stopped', async () => {
    const stop = startViewPruneMonitor();
    await vi.advanceTimersByTimeAsync(0);
    expect(prune).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(prune).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(prune).toHaveBeenCalledTimes(3);
  });

  it('judges each check from the moment it runs', async () => {
    const stop = startViewPruneMonitor();
    await vi.advanceTimersByTimeAsync(HOUR);
    stop();

    expect(prune.mock.calls).toEqual([[NOW], [new Date(NOW.getTime() + HOUR)]]);
  });

  it('logs how many views it deleted, and nothing about them', async () => {
    prune.mockResolvedValueOnce(7);

    const stop = startViewPruneMonitor();
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(infoLog.mock.calls).toEqual([['[view prune] deleted old views', { deleted: 7 }]]);
  });

  it('logs nothing when there was nothing to delete', async () => {
    const stop = startViewPruneMonitor();
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(infoLog).not.toHaveBeenCalled();
  });

  it('logs a failed check and keeps checking', async () => {
    const failure = new Error('Database unavailable');
    prune.mockReset();
    prune.mockRejectedValueOnce(failure).mockResolvedValue(0);

    const stop = startViewPruneMonitor();
    await vi.advanceTimersByTimeAsync(0);
    expect(errorLog.mock.calls).toEqual([['[view prune] check failed', failure]]);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(prune).toHaveBeenCalledTimes(2);
    stop();
  });
});
