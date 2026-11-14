/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { remindApproversOfOverdue } from '@/lib/services/submission-notices';

import {
  OVERDUE_REMINDER_KEY,
  runOverdueReminder,
  startOverdueReminderMonitor,
} from './submission-overdue-reminder';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/site-settings-repository', () => ({
  SiteSettingsRepository: { claimValue: vi.fn() },
}));
vi.mock('@/lib/repositories/submission-repository', () => ({
  SubmissionRepository: { countAwaitingBefore: vi.fn() },
}));
vi.mock('@/lib/services/submission-notices', () => ({ remindApproversOfOverdue: vi.fn() }));

const errorLog = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { notifications: { error: errorLog, info: vi.fn() } },
}));

// A Wednesday; five business days before it is the Wednesday before.
const WEDNESDAY = new Date('2026-11-11T15:30:00.000Z');
const CUTOFF = new Date('2026-11-04T15:30:00.000Z');
const SATURDAY = new Date('2026-11-14T15:30:00.000Z');
const HOUR = 3_600_000;

describe('runOverdueReminder', () => {
  it('reminds approvers of what has waited more than five business days, and claims the day', async () => {
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockResolvedValueOnce(3);
    vi.mocked(SiteSettingsRepository.claimValue).mockResolvedValueOnce(true);

    await expect(runOverdueReminder(WEDNESDAY)).resolves.toBe('sent');
    expect(vi.mocked(SubmissionRepository.countAwaitingBefore).mock.calls).toEqual([[CUTOFF]]);
    expect(vi.mocked(SiteSettingsRepository.claimValue).mock.calls).toEqual([
      [OVERDUE_REMINDER_KEY, '2026-11-11'],
    ]);
    expect(vi.mocked(remindApproversOfOverdue).mock.calls).toEqual([[3]]);
  });

  it('sends nothing, and claims nothing, when nothing is overdue', async () => {
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockResolvedValueOnce(0);

    await expect(runOverdueReminder(WEDNESDAY)).resolves.toBe('nothing-overdue');
    expect(SiteSettingsRepository.claimValue).not.toHaveBeenCalled();
    expect(remindApproversOfOverdue).not.toHaveBeenCalled();
  });

  it('sends nothing when today’s reminder has already gone out', async () => {
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockResolvedValueOnce(3);
    vi.mocked(SiteSettingsRepository.claimValue).mockResolvedValueOnce(false);

    await expect(runOverdueReminder(WEDNESDAY)).resolves.toBe('already-sent');
    expect(remindApproversOfOverdue).not.toHaveBeenCalled();
  });

  it('does nothing at a weekend, which is not a business day', async () => {
    await expect(runOverdueReminder(SATURDAY)).resolves.toBe('not-a-business-day');
    expect(SubmissionRepository.countAwaitingBefore).not.toHaveBeenCalled();
  });
});

describe('startOverdueReminderMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(WEDNESDAY);
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockResolvedValue(0);
  });

  afterEach(() => {
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockReset();
    vi.useRealTimers();
  });

  it('checks at once and then every hour, until stopped', async () => {
    const stop = startOverdueReminderMonitor();
    await vi.advanceTimersByTimeAsync(0);
    expect(SubmissionRepository.countAwaitingBefore).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(SubmissionRepository.countAwaitingBefore).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(SubmissionRepository.countAwaitingBefore).toHaveBeenCalledTimes(3);
  });

  it('logs a failed check and keeps checking', async () => {
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockReset();
    vi.mocked(SubmissionRepository.countAwaitingBefore)
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValue(0);

    const stop = startOverdueReminderMonitor();
    await vi.advanceTimersByTimeAsync(0);
    expect(errorLog).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR);
    expect(SubmissionRepository.countAwaitingBefore).toHaveBeenCalledTimes(2);
    stop();
  });
});
