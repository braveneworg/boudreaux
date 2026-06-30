/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './log.js';

describe('logEvent', () => {
  it('writes an info event as structured JSON to console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logEvent('info', 'enrichment_start', { artist: 'Ceschi' });

    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe('info');
    expect(payload.event).toBe('enrichment_start');
    expect(payload.artist).toBe('Ceschi');
    spy.mockRestore();
  });

  it('writes a warn event to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logEvent('warn', 'musicbrainz_failed', { error: 'boom' });

    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe('warn');
    expect(payload.event).toBe('musicbrainz_failed');
    expect(payload.error).toBe('boom');
    spy.mockRestore();
  });

  it('emits the event with no extra fields', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logEvent('info', 'enrichment_complete');

    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.event).toBe('enrichment_complete');
    spy.mockRestore();
  });
});

describe('toErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(toErrorMessage('plain string')).toBe('plain string');
  });
});
