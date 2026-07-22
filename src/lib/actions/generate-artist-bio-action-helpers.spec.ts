/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { resolveInFlightBioStatus } from './generate-artist-bio-action-helpers';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/services/bio-generation-service', () => ({
  BioGenerationService: { runGenerationJob: vi.fn() },
}));

const STALE_MS = 17 * 60 * 1000;
const fresh = (): Date => new Date(Date.now() - 60_000);

describe('resolveInFlightBioStatus', () => {
  it('echoes processing for a fresh processing job', () => {
    const status = resolveInFlightBioStatus({ bioStatus: 'processing', bioStartedAt: fresh() });

    expect(status).toBe('processing');
  });

  /**
   * The pending arm: a job is in flight from the moment the trigger writes
   * `pending`, before the service flips it to `processing`. Echoing it back is
   * what stops a second trigger starting a duplicate run in that window.
   */
  it('echoes pending for a fresh pending job', () => {
    const status = resolveInFlightBioStatus({ bioStatus: 'pending', bioStartedAt: fresh() });

    expect(status).toBe('pending');
  });

  it('allows a new run once an in-flight job has gone stale', () => {
    const status = resolveInFlightBioStatus({
      bioStatus: 'processing',
      bioStartedAt: new Date(Date.now() - (STALE_MS + 60_000)),
    });

    expect(status).toBeNull();
  });

  it('allows a new run when an in-flight job never recorded a start', () => {
    const status = resolveInFlightBioStatus({ bioStatus: 'processing', bioStartedAt: null });

    expect(status).toBeNull();
  });

  it('allows a new run for a terminal status', () => {
    const status = resolveInFlightBioStatus({ bioStatus: 'succeeded', bioStartedAt: fresh() });

    expect(status).toBeNull();
  });

  it('allows a new run when no bio has ever been generated', () => {
    const status = resolveInFlightBioStatus({ bioStatus: null, bioStartedAt: null });

    expect(status).toBeNull();
  });
});
