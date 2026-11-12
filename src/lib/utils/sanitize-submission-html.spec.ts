/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  sanitizeSubmissionAbout,
  sanitizeSubmissionWriting,
  submissionTextLength,
  submissionWritingLinks,
} from './sanitize-submission-html';

vi.mock('server-only', () => ({}));

const HARDENED = 'rel="nofollow noopener noreferrer" target="_blank"';

describe('sanitizeSubmissionAbout', () => {
  it('keeps paragraphs, line breaks, bold and italic', () => {
    expect(
      sanitizeSubmissionAbout('<p>Written on the <strong>bus</strong><br /><em>home</em></p>')
    ).toBe('<p>Written on the <strong>bus</strong><br /><em>home</em></p>');
  });

  it('rewrites presentational bold and italic as strong and em', () => {
    expect(sanitizeSubmissionAbout('<p><b>loud</b> and <i>quiet</i></p>')).toBe(
      '<p><strong>loud</strong> and <em>quiet</em></p>'
    );
  });

  it.each([
    ['a heading', '<h2>Big</h2><p>text</p>', 'Big<p>text</p>'],
    ['a link', '<p><a href="https://example.com">site</a></p>', '<p>site</p>'],
    ['an image', '<p>before<img src="https://example.com/x.png" />after</p>', '<p>beforeafter</p>'],
    ['a list', '<ul><li>one</li></ul>', 'one'],
    ['a span with a style', '<p><span style="color:red">red</span></p>', '<p>red</p>'],
  ])('removes %s and keeps its text', (_name, input, expected) => {
    expect(sanitizeSubmissionAbout(input)).toBe(expected);
  });

  it('discards a script with its contents', () => {
    expect(sanitizeSubmissionAbout('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('drops every attribute, event handlers included', () => {
    expect(sanitizeSubmissionAbout('<p onclick="steal()" class="x" style="color:red">hi</p>')).toBe(
      '<p>hi</p>'
    );
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeSubmissionAbout('  <p>hi</p>\n')).toBe('<p>hi</p>');
  });
});

describe('sanitizeSubmissionWriting', () => {
  it('keeps headings, bold, italic and paragraphs', () => {
    expect(
      sanitizeSubmissionWriting(
        '<h2>Title</h2><h3>Part</h3><p><strong>one</strong> <em>two</em><br />three</p>'
      )
    ).toBe('<h2>Title</h2><h3>Part</h3><p><strong>one</strong> <em>two</em><br />three</p>');
  });

  it.each([
    ['h1', '<h1>Top</h1>', 'Top'],
    ['h4', '<h4>Deep</h4>', 'Deep'],
    ['an image', '<p>a<img src="https://example.com/x.png" />b</p>', '<p>ab</p>'],
    ['an iframe', '<p>a</p><iframe src="https://example.com"></iframe>', '<p>a</p>'],
  ])('removes %s', (_name, input, expected) => {
    expect(sanitizeSubmissionWriting(input)).toBe(expected);
  });

  it('hardens an http link, whatever rel and target it arrived with', () => {
    expect(
      sanitizeSubmissionWriting(
        '<p><a href="https://example.com/zine" rel="opener" target="_self">zine</a></p>'
      )
    ).toBe(`<p><a href="https://example.com/zine" ${HARDENED}>zine</a></p>`);
  });

  it('hardens a link to this site the same as any other', () => {
    expect(
      sanitizeSubmissionWriting('<p><a href="https://fakefourrecords.com/artists">us</a></p>')
    ).toBe(`<p><a href="https://fakefourrecords.com/artists" ${HARDENED}>us</a></p>`);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['mailto:', 'mailto:someone@example.com'],
    ['protocol-relative', '//example.com/x'],
    ['site-relative', '/admin'],
  ])('unwraps a %s link and keeps its text', (_name, href) => {
    expect(sanitizeSubmissionWriting(`<p><a href="${href}">click</a></p>`)).toBe('<p>click</p>');
  });

  it('unwraps a link with no href', () => {
    expect(sanitizeSubmissionWriting('<p><a name="x">anchor</a></p>')).toBe('<p>anchor</p>');
  });

  it('drops event handlers and styles from every tag', () => {
    expect(
      sanitizeSubmissionWriting(
        '<h2 onmouseover="x()">T</h2><p style="position:fixed"><a href="https://example.com" onclick="y()">l</a></p>'
      )
    ).toBe(`<h2>T</h2><p><a href="https://example.com" ${HARDENED}>l</a></p>`);
  });

  it('discards a script with its contents', () => {
    expect(sanitizeSubmissionWriting('<script>alert(1)</script><p>poem</p>')).toBe('<p>poem</p>');
  });
});

describe('submissionTextLength', () => {
  it('counts the text a reader sees, not the markup', () => {
    expect(submissionTextLength('<p><strong>abc</strong> de</p>')).toBe(6);
  });

  it('counts an encoded character once', () => {
    expect(submissionTextLength('<p>a &amp; b &lt; c</p>')).toBe(9);
  });

  it('is zero for markup with no text', () => {
    expect(submissionTextLength('<p></p><p><br /></p>')).toBe(0);
  });

  it('ignores surrounding whitespace', () => {
    expect(submissionTextLength('<p>  hi  </p>')).toBe(2);
  });
});

describe('submissionWritingLinks', () => {
  it('lists every link href in document order', () => {
    const html = sanitizeSubmissionWriting(
      '<p><a href="https://one.example/a">1</a> and <a href="https://two.example/b">2</a></p>'
    );

    expect(submissionWritingLinks(html)).toEqual([
      'https://one.example/a',
      'https://two.example/b',
    ]);
  });

  it('lists a repeated href once per link', () => {
    const html = sanitizeSubmissionWriting(
      '<p><a href="https://one.example">1</a><a href="https://one.example">again</a></p>'
    );

    expect(submissionWritingLinks(html)).toEqual(['https://one.example', 'https://one.example']);
  });

  it('decodes an encoded ampersand in a href', () => {
    const html = sanitizeSubmissionWriting('<p><a href="https://one.example/?a=1&b=2">1</a></p>');

    expect(submissionWritingLinks(html)).toEqual(['https://one.example/?a=1&b=2']);
  });

  it('is empty for a writing with no links', () => {
    expect(submissionWritingLinks('<p>no links</p>')).toEqual([]);
  });
});
