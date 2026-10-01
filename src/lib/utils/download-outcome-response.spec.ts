/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { downloadRefusal } from './download-outcome-response';

const RESET_AT = new Date('2026-10-02T11:00:00.000Z');

describe('downloadRefusal', () => {
  it('maps NOT_FOUND to 404', () => {
    expect(downloadRefusal({ ok: false, denial: null, reason: 'NOT_FOUND' })).toEqual({
      status: 404,
      body: { success: false, error: 'NOT_FOUND', message: 'Release not found.' },
    });
  });

  it('maps LOCK_HELD to 409', () => {
    expect(downloadRefusal({ ok: false, denial: null, reason: 'LOCK_HELD' })).toMatchObject({
      status: 409,
      body: { error: 'LOCK_HELD' },
    });
  });

  it.each([
    ['NO_FILES', 404, 'NO_FILES'],
    ['PURCHASE_REQUIRED', 403, 'PURCHASE_REQUIRED'],
    ['DELETED', 410, 'DELETED'],
    ['LIFETIME_CAP', 403, 'QUOTA_EXCEEDED'],
  ] as const)('maps %s to %i %s', (reason, status, error) => {
    expect(downloadRefusal({ ok: false, denial: { kind: 'denial', reason } })).toMatchObject({
      status,
      body: { success: false, error },
    });
  });

  it('maps THROTTLED to 403 CAP_REACHED with the reset moment', () => {
    const refusal = downloadRefusal({
      ok: false,
      denial: { kind: 'denial', reason: 'THROTTLED', resetsAt: RESET_AT },
    });

    expect(refusal).toMatchObject({
      status: 403,
      body: { error: 'CAP_REACHED', errorCode: 'CAP_REACHED', resetsAtIso: RESET_AT.toISOString() },
    });
  });

  it('maps DOWNLOAD_LIMIT to 403 with the hours until reset', () => {
    const refusal = downloadRefusal({
      ok: false,
      denial: { kind: 'denial', reason: 'DOWNLOAD_LIMIT', resetInHours: 4 },
    });

    expect(refusal).toMatchObject({
      status: 403,
      body: { error: 'DOWNLOAD_LIMIT', resetInHours: 4 },
    });
  });

  it('names the formats behind PURCHASE_REQUIRED', () => {
    const refusal = downloadRefusal({
      ok: false,
      denial: { kind: 'denial', reason: 'PURCHASE_REQUIRED', formats: ['FLAC'] },
    });

    expect(refusal.body).toMatchObject({ formats: ['FLAC'], contactSupportUrl: '/support' });
  });
});
