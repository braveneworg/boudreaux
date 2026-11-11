/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { queuePositionMessage } from './queue-position-message';

const REPLY = 'We usually reply within 2 to 5 business days.';

describe('queuePositionMessage', () => {
  it('says next in line when none are ahead', () => {
    expect(queuePositionMessage(0)).toBe(`You're next in line for approval. ${REPLY}`);
  });

  it('names one submission ahead in the singular', () => {
    expect(queuePositionMessage(1)).toBe(`1 submission is ahead of yours. ${REPLY}`);
  });

  it.each([2, 14])('names %d submissions ahead in the plural', (ahead) => {
    expect(queuePositionMessage(ahead)).toBe(`${ahead} submissions are ahead of yours. ${REPLY}`);
  });

  it('treats a negative count as next in line', () => {
    expect(queuePositionMessage(-1)).toBe(`You're next in line for approval. ${REPLY}`);
  });
});
