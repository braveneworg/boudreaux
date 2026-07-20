/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';

import { BioFigure } from '@/app/components/ui/bio-figure-extension';
import type { BioFigureAttributes } from '@/app/components/ui/bio-figure-extension';
import {
  BIO_FIGURE_WIDTH_PERCENT,
  MAX_BIO_FIGURES,
  composeBioFigures,
} from '@/lib/utils/compose-bio-figures';
import type { BioFigureImageMeta } from '@/lib/utils/compose-bio-figures';
import { sanitizeBioHtml } from '@/lib/utils/sanitize-bio-html';

const meta = (overrides: Partial<BioFigureImageMeta> = {}): BioFigureImageMeta => ({
  url: 'https://cdn.example/x.webp',
  alt: null,
  title: null,
  attribution: null,
  ...overrides,
});

const wrapImg = (index: number): string => `<p>Body <img src="image:${index}"> more.</p>`;

describe('composeBioFigures constants', () => {
  it('caps emitted figures at 5', () => {
    expect(MAX_BIO_FIGURES).toBe(5);
  });

  it('exposes the 40% figure width', () => {
    expect(BIO_FIGURE_WIDTH_PERCENT).toBe(40);
  });
});

describe('composeBioFigures alternation', () => {
  it('alternates right, left, right across three placeholders', () => {
    const html = wrapImg(0) + wrapImg(1) + wrapImg(2);
    const byIndex = new Map<number, BioFigureImageMeta>([
      [0, meta()],
      [1, meta()],
      [2, meta()],
    ]);
    const result = composeBioFigures(html, byIndex);
    const floats = [...result.matchAll(/bio-figure--(right|left)/g)].map((m) => m[1]);
    expect(floats).toEqual(['right', 'left', 'right']);
  });
});

describe('composeBioFigures cap', () => {
  it('emits only the first five figures', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6];
    const html = indices.map(wrapImg).join('');
    const byIndex = new Map<number, BioFigureImageMeta>(
      indices.map((index): [number, BioFigureImageMeta] => [index, meta()])
    );
    const result = composeBioFigures(html, byIndex);
    expect(result.match(/<figure\b/g)).toHaveLength(5);
  });

  it('leaves the sixth and seventh img tags untouched', () => {
    const indices = [0, 1, 2, 3, 4, 5, 6];
    const html = indices.map(wrapImg).join('');
    const byIndex = new Map<number, BioFigureImageMeta>(
      indices.map((index): [number, BioFigureImageMeta] => [index, meta()])
    );
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('<img src="image:5">');
    expect(result).toContain('<img src="image:6">');
  });
});

describe('composeBioFigures unmapped index', () => {
  it('leaves an unmapped placeholder tag untouched', () => {
    const html = wrapImg(3);
    const result = composeBioFigures(html, new Map());
    expect(result).toBe(html);
  });

  it('does not let an unmapped index consume a float slot', () => {
    const html = wrapImg(0) + wrapImg(1);
    const byIndex = new Map<number, BioFigureImageMeta>([[1, meta()]]);
    const result = composeBioFigures(html, byIndex);
    // index 0 is unmapped, so index 1 is the FIRST emitted figure → right.
    expect(result).toContain('bio-figure--right');
    expect(result).not.toContain('bio-figure--left');
  });

  it('does not count an unmapped index toward the cap', () => {
    // 5 unmapped placeholders then 5 mapped ones → all 5 mapped become figures.
    const unmapped = [0, 1, 2, 3, 4];
    const mapped = [5, 6, 7, 8, 9];
    const html = [...unmapped, ...mapped].map(wrapImg).join('');
    const byIndex = new Map<number, BioFigureImageMeta>(
      mapped.map((index): [number, BioFigureImageMeta] => [index, meta()])
    );
    const result = composeBioFigures(html, byIndex);
    expect(result.match(/<figure\b/g)).toHaveLength(5);
  });
});

describe('composeBioFigures captions', () => {
  it('omits the figcaption when title and attribution are both null', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).not.toContain('figcaption');
  });

  it('omits the figcaption when title and attribution are only whitespace', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([
      [0, meta({ title: '   ', attribution: '\t' })],
    ]);
    const result = composeBioFigures(html, byIndex);
    expect(result).not.toContain('figcaption');
  });

  it('emits only the title span for a title-only meta', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta({ title: 'Ceschi' })]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('<span class="bio-figure-title">Ceschi</span>');
    expect(result).not.toContain('bio-figure-attribution');
  });

  it('emits only the attribution span for an attribution-only meta', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([
      [0, meta({ attribution: 'Wikimedia Commons' })],
    ]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('<span class="bio-figure-attribution">Wikimedia Commons</span>');
    expect(result).not.toContain('bio-figure-title');
  });
});

describe('composeBioFigures alt precedence', () => {
  it('prefers meta.alt over the original tag alt', () => {
    const html = '<p><img src="image:0" alt="original"></p>';
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta({ alt: 'meta alt' })]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt="meta alt"');
  });

  it('falls back to the original tag alt when meta.alt is null', () => {
    const html = '<p><img src="image:0" alt="original"></p>';
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt="original"');
  });

  it('falls back to an empty alt when neither is present', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt=""');
  });

  it('preserves an original double-quoted alt containing an apostrophe', () => {
    const html = `<p><img src="image:0" alt="Ceschi's guitar"></p>`;
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt="Ceschi&#39;s guitar"');
  });

  it('reads a single-quoted original alt', () => {
    const html = `<p><img src="image:0" alt='solo show'></p>`;
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt="solo show"');
  });

  it('does not mistake a data-alt attribute for the alt', () => {
    const html = '<p><img data-alt="decoy" src="image:0"></p>';
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt=""');
  });
});

describe('composeBioFigures escaping', () => {
  it('entity-escapes a dangerous title', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([
      [0, meta({ title: `<script>alert("x")&'` })],
    ]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain(
      '<span class="bio-figure-title">&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;</span>'
    );
  });

  it('escapes an ampersand in the url attribute', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([
      [0, meta({ url: 'https://cdn.example/x.webp?a=1&b=2' })],
    ]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('src="https://cdn.example/x.webp?a=1&amp;b=2"');
  });

  it('escapes a double quote in the alt attribute', () => {
    const html = wrapImg(0);
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta({ alt: 'a "quoted" alt' })]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('alt="a &quot;quoted&quot; alt"');
  });
});

describe('composeBioFigures matching robustness', () => {
  it('matches a placeholder with attributes before and after the src', () => {
    const html = `<p><img class="foo" src='image:0' data-x="y"></p>`;
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('<figure');
    expect(result).not.toContain('image:0');
  });

  it('matches a self-closing placeholder tag', () => {
    const html = '<p><img src="image:1" /></p>';
    const byIndex = new Map<number, BioFigureImageMeta>([[1, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('<figure');
    expect(result).not.toContain('image:1');
  });

  it('never touches an img with a real http src', () => {
    const html = '<p><img src="https://cdn.example/real.webp" alt="real"></p>';
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toBe(html);
  });

  it('matches a two-digit index', () => {
    const html = wrapImg(12);
    const byIndex = new Map<number, BioFigureImageMeta>([[12, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toContain('<figure');
    expect(result).not.toContain('image:12');
  });

  it('leaves text mentioning image:0 outside a tag untouched', () => {
    const html = '<p>See image:0 in the archive.</p>';
    const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);
    const result = composeBioFigures(html, byIndex);
    expect(result).toBe(html);
  });
});

// --- Load-bearing round-trip spec ---------------------------------------

const createEditor = (content: string): Editor =>
  new Editor({ extensions: [StarterKit, BioFigure], content });

const firstFigureHtml = (html: string): string => {
  const match = /<figure\b[\s\S]*?<\/figure>/.exec(html);
  if (!match) throw new Error('no figure found');
  return match[0];
};

const nthFigureHtml = (html: string, n: number): string => {
  const figure = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map((m) => m[0]).at(n);
  if (!figure) throw new Error(`no figure at index ${n}`);
  return figure;
};

describe('composeBioFigures round-trip through the BioFigure extension', () => {
  const html = wrapImg(0) + wrapImg(1);
  const byIndex = new Map<number, BioFigureImageMeta>([
    [
      0,
      meta({
        url: 'https://cdn.example/one.webp',
        alt: 'Ceschi live',
        title: 'Ceschi',
        attribution: 'Wikimedia Commons',
      }),
    ],
    [1, meta({ url: 'https://cdn.example/two.webp', alt: 'plain' })],
  ]);
  const composed = sanitizeBioHtml(composeBioFigures(html, byIndex));

  it('parses the captioned figure into the expected node attrs', () => {
    const figure = firstFigureHtml(composed);
    const editor = createEditor(figure);
    const attrs = editor.state.doc.firstChild?.attrs as BioFigureAttributes;
    expect(attrs).toEqual({
      src: 'https://cdn.example/one.webp',
      alt: 'Ceschi live',
      width: 40,
      float: 'right',
      title: 'Ceschi',
      subtitle: null,
      attribution: 'Wikimedia Commons',
    });
  });

  it('parses the captionless figure into the expected node attrs', () => {
    const figure = nthFigureHtml(composed, 1);
    const editor = createEditor(figure);
    const attrs = editor.state.doc.firstChild?.attrs as BioFigureAttributes;
    expect(attrs).toEqual({
      src: 'https://cdn.example/two.webp',
      alt: 'plain',
      width: 40,
      float: 'left',
      title: null,
      subtitle: null,
      attribution: null,
    });
  });

  it('losslessly re-serializes the captioned figure', () => {
    const figure = firstFigureHtml(composed);
    const editor = createEditor(figure);
    // Both the composed HTML and the editor's saved HTML pass through the same
    // canonical sanitizer in production, so compare under that normalization.
    expect(firstFigureHtml(sanitizeBioHtml(editor.getHTML()))).toBe(figure);
  });

  it('losslessly re-serializes the captionless figure', () => {
    const figure = nthFigureHtml(composed, 1);
    const editor = createEditor(figure);
    expect(firstFigureHtml(sanitizeBioHtml(editor.getHTML()))).toBe(figure);
  });
});

/**
 * `assembleContent` composes figures BEFORE plain-swapping the remaining
 * `image:N` placeholders for real URLs, and that order is load-bearing —
 * composition matches on the `image:N` src, so a swap that ran first would
 * leave nothing to match. The failure is silent: valid HTML, every image
 * present, just no floated figures anywhere in any long bio.
 *
 * The ordering was previously recorded only in a comment on `assembleContent`.
 */
describe('placeholder composition ordering', () => {
  const byIndex = new Map<number, BioFigureImageMeta>([[0, meta()]]);

  it('composes a figure while the placeholder src is still unresolved', () => {
    expect(composeBioFigures(wrapImg(0), byIndex)).toContain('<figure');
  });

  it('composes nothing once the placeholder has been swapped for a real URL', () => {
    const alreadySwapped = '<p>Body <img src="https://cdn.example/photo.jpg"> more.</p>';

    expect(composeBioFigures(alreadySwapped, byIndex)).not.toContain('<figure');
  });
});
