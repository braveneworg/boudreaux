/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent, toErrorMessage } from './log.js';

describe('logEvent', () => {
  it('writes an info event as structured JSON to console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logEvent('info', 'reencode_complete', { kind: 'VIDEO' });

    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe('info');
    expect(payload.event).toBe('reencode_complete');
    expect(payload.kind).toBe('VIDEO');
    spy.mockRestore();
  });

  it('writes a warn event to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logEvent('warn', 'reencode_refused', { failure: 'too-long' });

    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe('warn');
    expect(payload.event).toBe('reencode_refused');
    expect(payload.failure).toBe('too-long');
    spy.mockRestore();
  });

  it('emits the event with no extra fields', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logEvent('info', 'reencode_complete');

    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.event).toBe('reencode_complete');
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
