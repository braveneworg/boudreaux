/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parse an SSE text buffer into discrete events. Returns any trailing
 * incomplete block as `remaining` so it can be prepended to the next chunk.
 *
 * SSE events are delimited by double newlines (`\n\n`). Each block may
 * contain `event:` and `data:` fields.
 */
export function parseSSEBuffer(buffer: string): {
  events: SSEEvent[];
  remaining: string;
} {
  const events: SSEEvent[] = [];
  const blocks = buffer.split('\n\n');

  // The last element may be an incomplete block — carry it over
  const remaining = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) continue;

    let event = 'message';
    let data = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (data) {
      events.push({ event, data });
    }
  }

  return { events, remaining };
}
