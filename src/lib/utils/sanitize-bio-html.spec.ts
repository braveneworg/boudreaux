/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { sanitizeBioHtml, sanitizeBioText } from './sanitize-bio-html';

vi.mock('server-only', () => ({}));

describe('sanitizeBioHtml', () => {
  it('removes script tags and their content', () => {
    const result = sanitizeBioHtml('<p>Hi</p><script>alert(1)</script>');

    expect(result).toBe('<p>Hi</p>');
  });

  it('keeps allowed formatting tags', () => {
    const result = sanitizeBioHtml('<p><strong>Bold</strong> and <em>italic</em></p>');

    expect(result).toBe('<p><strong>Bold</strong> and <em>italic</em></p>');
  });

  it('forces rel="nofollow noopener noreferrer" on links', () => {
    const result = sanitizeBioHtml('<a href="https://example.com">link</a>');

    expect(result).toContain('rel="nofollow noopener noreferrer"');
  });

  it('forces target="_blank" on links', () => {
    const result = sanitizeBioHtml('<a href="https://example.com">link</a>');

    expect(result).toContain('target="_blank"');
  });

  it('drops javascript: scheme links', () => {
    const result = sanitizeBioHtml('<a href="javascript:alert(1)">x</a>');

    expect(result).not.toContain('javascript:');
  });

  it('keeps section headings h2 through h4', () => {
    const result = sanitizeBioHtml('<h2>Career</h2><h3>Early years</h3><h4>1985</h4>');

    expect(result).toBe('<h2>Career</h2><h3>Early years</h3><h4>1985</h4>');
  });

  it('discards h1 but keeps its text (reserved for the page title)', () => {
    const result = sanitizeBioHtml('<h1>Name</h1><p>bio</p>');

    expect(result).toBe('Name<p>bio</p>');
  });

  it('discards disallowed tags like iframe', () => {
    const result = sanitizeBioHtml('<p>text</p><iframe></iframe>');

    expect(result).toBe('<p>text</p>');
  });

  it('keeps http(s) images with their dimensions', () => {
    const result = sanitizeBioHtml(
      '<img src="https://cdn.example.com/media/artists/a/bio/0.jpg" alt="x" width="800" height="600">'
    );

    expect(result).toContain('src="https://cdn.example.com/media/artists/a/bio/0.jpg"');
    expect(result).toContain('width="800"');
  });

  it('drops images with a javascript: or data: scheme', () => {
    const result = sanitizeBioHtml(
      '<img src="javascript:alert(1)"><img src="data:image/png;base64,xxx">'
    );

    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('data:');
  });

  it('keeps a span font-size style', () => {
    const result = sanitizeBioHtml('<p><span style="font-size: 18px">big</span></p>');

    expect(result).toContain('font-size:18px');
  });

  it('strips a disallowed inline style', () => {
    const result = sanitizeBioHtml(
      '<p><span style="position: fixed; font-size: 18px">x</span></p>'
    );

    expect(result).not.toContain('position');
  });

  it('strips event-handler attributes', () => {
    const result = sanitizeBioHtml('<p onclick="evil()">text</p>');

    expect(result).not.toContain('onclick');
  });
});

describe('sanitizeBioText', () => {
  it('strips all markup to plain text', () => {
    const result = sanitizeBioText('<strong>Bold</strong> teaser <script>x</script>');

    expect(result).toBe('Bold teaser');
  });

  it('returns plain text unchanged', () => {
    const result = sanitizeBioText('Just a teaser.');

    expect(result).toBe('Just a teaser.');
  });

  it('decodes entities so ampersands render literally, not as &amp;', () => {
    const result = sanitizeBioText('<p>Hall &amp; Oates</p>');

    expect(result).toBe('Hall & Oates');
  });

  it('decodes angle brackets from stripped markup', () => {
    const result = sanitizeBioText('rock &lt; pop &gt; jazz');

    expect(result).toBe('rock < pop > jazz');
  });
});
