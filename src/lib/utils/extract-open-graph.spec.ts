/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { extractOpenGraph } from './extract-open-graph';

const PAGE_URL = 'https://artist.test/path/page';

describe('extractOpenGraph', () => {
  it('parses a meta tag whose content precedes its property', () => {
    const html = `<head><meta content="Order A" property="og:title" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Order A');
  });

  it('parses a meta tag whose property precedes its content', () => {
    const html = `<head><meta property="og:title" content="Order B" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Order B');
  });

  it('parses single-quoted attribute values', () => {
    const html = `<head><meta property='og:title' content='Single Quoted' /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Single Quoted');
  });

  it('parses double-quoted attribute values', () => {
    const html = `<head><meta property="og:title" content="Double Quoted" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Double Quoted');
  });

  it('prefers og:title over twitter:title and the <title> tag', () => {
    const html = `<head>
      <title>Title Tag</title>
      <meta name="twitter:title" content="Twitter Title" />
      <meta property="og:title" content="OG Title" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('OG Title');
  });

  it('falls back to twitter:title when og:title is absent', () => {
    const html = `<head>
      <title>Title Tag</title>
      <meta name="twitter:title" content="Twitter Title" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Twitter Title');
  });

  it('falls back to the <title> tag when no og/twitter title exists', () => {
    const html = `<head><title>Title Tag</title></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Title Tag');
  });

  it('returns null title when no title source exists', () => {
    const html = `<head><meta property="og:description" content="d" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBeNull();
  });

  it('prefers og:description over twitter:description and meta[name=description]', () => {
    const html = `<head>
      <meta name="description" content="Plain Meta" />
      <meta name="twitter:description" content="Twitter Desc" />
      <meta property="og:description" content="OG Desc" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBe('OG Desc');
  });

  it('falls back to twitter:description when og:description is absent', () => {
    const html = `<head>
      <meta name="description" content="Plain Meta" />
      <meta name="twitter:description" content="Twitter Desc" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBe('Twitter Desc');
  });

  it('falls back to meta[name=description] when no og/twitter description exists', () => {
    const html = `<head><meta name="description" content="Plain Meta" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBe('Plain Meta');
  });

  it('extracts og:site_name', () => {
    const html = `<head><meta property="og:site_name" content="Example Site" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).siteName).toBe('Example Site');
  });

  it('returns null siteName when og:site_name is absent', () => {
    const html = `<head><meta property="og:title" content="t" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).siteName).toBeNull();
  });

  it('prefers og:image over twitter:image', () => {
    const html = `<head>
      <meta name="twitter:image" content="https://cdn.test/twitter.png" />
      <meta property="og:image" content="https://cdn.test/og.png" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://cdn.test/og.png');
  });

  it('falls back to twitter:image when og:image is absent', () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.test/twitter.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://cdn.test/twitter.png');
  });

  it('decodes HTML entities in meta content', () => {
    const html = `<head><meta property="og:title" content="Ben &amp; Jerry&#39;s &lt;3" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe("Ben & Jerry's <3");
  });

  it('decodes HTML entities in the <title> tag text', () => {
    const html = `<head><title>Tom &amp; Jerry</title></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Tom & Jerry');
  });

  it('resolves a relative og:image against the page URL', () => {
    const html = `<head><meta property="og:image" content="/img/hero.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://artist.test/img/hero.png');
  });

  it('leaves an absolute og:image unchanged', () => {
    const html = `<head><meta property="og:image" content="https://cdn.test/a.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://cdn.test/a.png');
  });

  it('extracts a rel="icon" favicon', () => {
    const html = `<head><link rel="icon" href="/favicon.ico" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBe('https://artist.test/favicon.ico');
  });

  it('extracts a rel="shortcut icon" favicon', () => {
    const html = `<head><link rel="shortcut icon" href="/fav.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBe('https://artist.test/fav.png');
  });

  it('extracts a rel="apple-touch-icon" favicon', () => {
    const html = `<head><link rel="apple-touch-icon" href="https://cdn.test/apple.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBe('https://cdn.test/apple.png');
  });

  it('returns null favicon when no icon link exists', () => {
    const html = `<head><link rel="stylesheet" href="/main.css" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBeNull();
  });

  it('still extracts tags from a document with no <head> element', () => {
    const html = `<html><body><meta property="og:title" content="No Head" /></body></html>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('No Head');
  });

  it('returns all-null tags for a document with no meta/title/link tags', () => {
    const html = `<html><head></head><body><p>hello</p></body></html>`;
    expect(extractOpenGraph(html, PAGE_URL)).toEqual({
      title: null,
      description: null,
      siteName: null,
      imageUrl: null,
      faviconUrl: null,
    });
  });

  it('ignores meta tags beyond the head byte cap when there is no </head>', () => {
    const html =
      `<html><head><meta property="og:title" content="Top" />` +
      'x'.repeat(600 * 1024) +
      `<meta property="og:description" content="Below Cap" />`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBeNull();
  });

  it('does not throw on an out-of-range hex numeric entity', () => {
    const html = `<head><meta property="og:title" content="X&#x110000;Y" /></head>`;
    expect(() => extractOpenGraph(html, PAGE_URL)).not.toThrow();
  });

  it('preserves an out-of-range hex numeric entity as literal text', () => {
    const html = `<head><meta property="og:title" content="X&#x110000;Y" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toContain('&#x110000;');
  });

  it('does not throw on an out-of-range decimal numeric entity', () => {
    const html = `<head><meta property="og:title" content="A&#9999999999;B" /></head>`;
    expect(() => extractOpenGraph(html, PAGE_URL)).not.toThrow();
  });

  it('preserves an out-of-range decimal numeric entity as literal text', () => {
    const html = `<head><meta property="og:title" content="A&#9999999999;B" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toContain('&#9999999999;');
  });

  it('decodes a valid hex numeric entity in meta content', () => {
    const html = `<head><meta property="og:title" content="1 &#x3C; 2" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('1 < 2');
  });
});
