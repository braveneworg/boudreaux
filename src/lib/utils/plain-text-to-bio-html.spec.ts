/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { plainTextToBioHtml } from './plain-text-to-bio-html';

describe('plainTextToBioHtml', () => {
  it('returns an empty string for nullish or empty input', () => {
    expect(plainTextToBioHtml(null)).toBe('');
    expect(plainTextToBioHtml(undefined)).toBe('');
    expect(plainTextToBioHtml('')).toBe('');
  });

  it('passes existing HTML through untouched', () => {
    const html = '<p>Already <strong>rich</strong> text.</p>';

    expect(plainTextToBioHtml(html)).toBe(html);
  });

  it('wraps blank-line-separated plain text into paragraphs', () => {
    expect(plainTextToBioHtml('Line one\n\nLine two')).toBe('<p>Line one</p><p>Line two</p>');
  });

  it('converts single newlines within a block to <br>', () => {
    expect(plainTextToBioHtml('Line one\nLine two')).toBe('<p>Line one<br>Line two</p>');
  });

  it('escapes HTML special characters in legacy plain text', () => {
    expect(plainTextToBioHtml('rock & roll < pop')).toBe('<p>rock &amp; roll &lt; pop</p>');
  });
});
