/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SubmissionReportService } from '@/lib/services/submission-report-service';

import { startReportContactErasureMonitor } from './submission-report-contact-erasure';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/submission-report-service', () => ({
  SubmissionReportService: { eraseExpiredContacts: vi.fn() },
}));

const errorLog = vi.hoisted(() => vi.fn());
const infoLog = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { notifications: { error: errorLog, info: infoLog } },
}));

const NOW = new Date('2026-11-12T15:30:00.000Z');
const HOUR = 3_600_000;

const erase = vi.mocked(SubmissionReportService.eraseExpiredContacts);

describe('startReportContactErasureMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    erase.mockReset();
    erase.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('erases at once and then every hour, until stopped', async () => {
    const stop = startReportContactErasureMonitor();
    await vi.advanceTimersByTimeAsync(0);
    expect(erase).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(erase).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(erase).toHaveBeenCalledTimes(3);
  });

  it('judges each check from the moment it runs', async () => {
    const stop = startReportContactErasureMonitor();
    await vi.advanceTimersByTimeAsync(HOUR);
    stop();

    expect(erase.mock.calls).toEqual([[NOW], [new Date(NOW.getTime() + HOUR)]]);
  });

  it('logs how many it erased, and nothing about them', async () => {
    erase.mockResolvedValueOnce(2);

    const stop = startReportContactErasureMonitor();
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(infoLog.mock.calls).toEqual([
      ['[report contact erasure] erased contact emails', { erased: 2 }],
    ]);
  });

  it('logs nothing when there was nothing to erase', async () => {
    const stop = startReportContactErasureMonitor();
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(infoLog).not.toHaveBeenCalled();
  });

  it('logs a failed check and keeps checking', async () => {
    erase.mockReset();
    erase.mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue(0);

    const stop = startReportContactErasureMonitor();
    await vi.advanceTimersByTimeAsync(0);
    expect(errorLog).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(erase).toHaveBeenCalledTimes(2);
    stop();
  });
});
