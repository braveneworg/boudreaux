/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { sanitizeBioHtml, sanitizeBioHtmlNoImages, sanitizeBioText } from './sanitize-bio-html';

vi.mock('server-only', () => ({}));

// Pin the app's own host so internal/external link branching is deterministic;
// every `example.com` href below is therefore external.
vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

describe('sanitizeBioHtml', () => {
  it('removes script tags and their content', () => {
    const result = sanitizeBioHtml('<p>Hi</p><script>alert(1)</script>');

    expect(result).toBe('<p>Hi</p>');
  });

  it('keeps allowed formatting tags', () => {
    const result = sanitizeBioHtml('<p><strong>Bold</strong> and <em>italic</em></p>');

    expect(result).toBe('<p><strong>Bold</strong> and <em>italic</em></p>');
  });

  it('keeps <b> and <i> formatting tags', () => {
    const result = sanitizeBioHtml('<p><b>bold</b> and <i>italic</i></p>');

    expect(result).toBe('<p><b>bold</b> and <i>italic</i></p>');
  });

  it('keeps list tags', () => {
    const result = sanitizeBioHtml('<ul><li>one</li></ul><ol><li>two</li></ol>');

    expect(result).toBe('<ul><li>one</li></ul><ol><li>two</li></ol>');
  });

  it('forces rel="nofollow noopener noreferrer" on external links', () => {
    const result = sanitizeBioHtml('<a href="https://example.com">link</a>');

    expect(result).toContain('rel="nofollow noopener noreferrer"');
  });

  it('forces target="_blank" on external links', () => {
    const result = sanitizeBioHtml('<a href="https://example.com">link</a>');

    expect(result).toContain('target="_blank"');
  });

  it('keeps an internal link same-tab without rel hardening', () => {
    const result = sanitizeBioHtml(
      '<p><a href="/releases/665f" target="_blank" rel="nofollow">Album</a></p>'
    );

    expect(result).toBe('<p><a href="/releases/665f">Album</a></p>');
  });

  it('treats an own-host absolute link as internal and unhardens it', () => {
    const result = sanitizeBioHtml(
      '<a href="https://www.fakefourrecords.com/artists/x">Artist</a>'
    );

    expect(result).toBe('<a href="https://www.fakefourrecords.com/artists/x">Artist</a>');
  });

  it('drops javascript: scheme links', () => {
    const result = sanitizeBioHtml('<a href="javascript:alert(1)">x</a>');

    expect(result).not.toContain('javascript:');
  });

  it('keeps listening-service hrefs (product rule reversed 2026-07)', () => {
    const result = sanitizeBioHtml('<a href="https://open.spotify.com/artist/x">Spotify</a>');

    expect(result).toBe(
      '<a href="https://open.spotify.com/artist/x" rel="nofollow noopener noreferrer" target="_blank">Spotify</a>'
    );
  });

  it('keeps the href on informative links', () => {
    const result = sanitizeBioHtml('<a href="https://radiohead.com">official site</a>');

    expect(result).toContain('href="https://radiohead.com"');
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

  it('preserves a bio figure with caption spans and percentage width', () => {
    const figure =
      '<figure class="bio-figure bio-figure--left" style="width:45%"><img src="https://cdn.example/x.webp" alt="x" /><figcaption class="bio-figure-caption"><span class="bio-figure-title">T</span></figcaption></figure>';

    const result = sanitizeBioHtml(figure);

    expect(result).toContain('bio-figure--left');
  });

  it('keeps the integer percentage width on a figure', () => {
    const result = sanitizeBioHtml(
      '<figure class="bio-figure" style="width:45%"><img src="https://cdn.example/x.webp" alt="" /></figure>'
    );

    expect(result).toContain('width:45%');
  });

  it('keeps a decimal percentage width on a figure', () => {
    const result = sanitizeBioHtml(
      '<figure class="bio-figure" style="width:33.5%"><img src="https://cdn.example/x.webp" alt="" /></figure>'
    );

    expect(result).toContain('width:33.5%');
  });

  it('keeps the caption span classes', () => {
    const result = sanitizeBioHtml(
      '<figure class="bio-figure"><img src="https://cdn.example/x.webp" alt="" /><figcaption class="bio-figure-caption"><span class="bio-figure-subtitle">S</span><span class="bio-figure-attribution">A</span></figcaption></figure>'
    );

    expect(result).toContain('bio-figure-subtitle');
  });

  it('strips a non-percentage figure width', () => {
    const result = sanitizeBioHtml(
      '<figure class="bio-figure" style="width:9999px"><img src="https://cdn.example/x.webp" alt="" /></figure>'
    );

    expect(result).not.toContain('9999px');
  });

  it('strips an unknown figure class', () => {
    const result = sanitizeBioHtml(
      '<figure class="bio-figure evil-class"><img src="https://cdn.example/x.webp" alt="" /></figure>'
    );

    expect(result).not.toContain('evil-class');
  });
});

describe('sanitizeBioHtmlNoImages', () => {
  it('strips <img> tags from the short bio while keeping surrounding prose', () => {
    const result = sanitizeBioHtmlNoImages(
      '<p>A great artist. <img src="https://cdn.example/x.webp" alt="x"> Known worldwide.</p>'
    );

    expect(result).not.toContain('<img');
    expect(result).toContain('A great artist.');
    expect(result).toContain('Known worldwide.');
  });

  it('keeps all non-image html tags allowed in the long bio', () => {
    const result = sanitizeBioHtmlNoImages(
      '<p><strong>Bold</strong> and <a href="https://example.com">linked</a></p>'
    );

    expect(result).toContain('<strong>Bold</strong>');
    expect(result).toContain('href="https://example.com"');
  });

  it('strips figures entirely from the short bio', () => {
    const result = sanitizeBioHtmlNoImages(
      '<p>a</p><figure class="bio-figure"><img src="https://cdn.example/x.webp" alt="" /></figure>'
    );

    expect(result).toBe('<p>a</p>');
  });

  it('does not strip images from the long bio (sanitizeBioHtml keeps them)', () => {
    const result = sanitizeBioHtml(
      '<p>Bio text. <img src="https://cdn.example/a.webp" alt="a" width="400" height="300"></p>'
    );

    expect(result).toContain('<img');
    expect(result).toContain('src="https://cdn.example/a.webp"');
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
