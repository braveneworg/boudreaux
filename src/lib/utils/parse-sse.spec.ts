/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseSSEBuffer } from './parse-sse';

describe('parseSSEBuffer', () => {
  it('should parse a single complete event', () => {
    const buffer = 'event: ready\ndata: {"formatType":"FLAC"}\n\n';

    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toEqual([{ event: 'ready', data: '{"formatType":"FLAC"}' }]);
    expect(remaining).toBe('');
  });

  it('should parse multiple complete events', () => {
    const buffer =
      'event: progress\ndata: {"status":"zipping"}\n\n' +
      'event: ready\ndata: {"downloadUrl":"https://example.com"}\n\n';

    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'progress', data: '{"status":"zipping"}' });
    expect(events[1]).toEqual({ event: 'ready', data: '{"downloadUrl":"https://example.com"}' });
    expect(remaining).toBe('');
  });

  it('should carry over an incomplete trailing block as remaining', () => {
    const buffer = 'event: progress\ndata: {"a":1}\n\nevent: ready\ndata: {"b":';

    const { events, remaining } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'progress', data: '{"a":1}' });
    expect(remaining).toBe('event: ready\ndata: {"b":');
  });

  it('should handle an empty buffer', () => {
    const { events, remaining } = parseSSEBuffer('');

    expect(events).toEqual([]);
    expect(remaining).toBe('');
  });

  it('should skip empty blocks between events', () => {
    const buffer = 'event: a\ndata: {"x":1}\n\n\n\nevent: b\ndata: {"y":2}\n\n';

    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('a');
    expect(events[1].event).toBe('b');
  });

  it('should default event name to "message" when not specified', () => {
    const buffer = 'data: {"hello":"world"}\n\n';

    const { events } = parseSSEBuffer(buffer);

    expect(events).toEqual([{ event: 'message', data: '{"hello":"world"}' }]);
  });

  it('should skip blocks with no data field', () => {
    const buffer = 'event: heartbeat\n\n';

    const { events } = parseSSEBuffer(buffer);

    expect(events).toEqual([]);
  });

  it('should handle remaining from a previous chunk combined with new data', () => {
    const chunk1 = 'event: progress\ndata: {"fmt":"FL';
    const chunk2 = 'AC"}\n\nevent: complete\ndata: {}\n\n';

    const result1 = parseSSEBuffer(chunk1);
    expect(result1.events).toHaveLength(0);
    expect(result1.remaining).toBe('event: progress\ndata: {"fmt":"FL');

    const result2 = parseSSEBuffer(result1.remaining + chunk2);
    expect(result2.events).toHaveLength(2);
    expect(result2.events[0]).toEqual({ event: 'progress', data: '{"fmt":"FLAC"}' });
    expect(result2.events[1]).toEqual({ event: 'complete', data: '{}' });
    expect(result2.remaining).toBe('');
  });

  it('should ignore lines that do not start with event: or data:', () => {
    const buffer = 'id: 123\nevent: update\nretry: 5000\ndata: {"ok":true}\n\n';

    const { events } = parseSSEBuffer(buffer);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'update', data: '{"ok":true}' });
  });
});
