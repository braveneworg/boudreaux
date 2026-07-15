/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Producer, VideoProducer } from './producer';

describe('producer domain types', () => {
  it('a Producer has id + name', () => {
    const p: Producer = {
      id: 'p1',
      name: 'Test Producer',
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(p.name).toBe('Test Producer');
  });

  it('a VideoProducer links a video to a producer', () => {
    const vp: VideoProducer = { id: 'vp1', videoId: 'v1', producerId: 'p1', sortOrder: 0 };
    expect(vp.producerId).toBe('p1');
  });
});
