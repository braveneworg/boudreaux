/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { toBioTeaser } from './bio-teaser';

describe('toBioTeaser', () => {
  it('strips tags to plain text', () => {
    const result = toBioTeaser('<p><strong>Radiohead</strong> are a band.</p>');

    expect(result).toBe('Radiohead are a band.');
  });

  it('decodes common entities', () => {
    const result = toBioTeaser('<p>Hall &amp; Oates &lt;pop&gt;</p>');

    expect(result).toBe('Hall & Oates <pop>');
  });

  it('collapses whitespace from block tags', () => {
    const result = toBioTeaser('<p>One</p><p>Two</p>');

    expect(result).toBe('One Two');
  });

  it('truncates to the word limit with an ellipsis', () => {
    const result = toBioTeaser('one two three four five', 3);

    expect(result).toBe('one two three…');
  });

  it('does not append an ellipsis when within the limit', () => {
    const result = toBioTeaser('one two three', 5);

    expect(result).toBe('one two three');
  });

  it('returns an empty string for empty input', () => {
    expect(toBioTeaser('')).toBe('');
  });
});
