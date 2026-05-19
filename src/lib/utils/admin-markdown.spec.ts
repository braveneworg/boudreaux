/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseAdminMarkdown } from './admin-markdown';

describe('parseAdminMarkdown', () => {
  describe('plain text', () => {
    it('returns a single text node for plain content', () => {
      expect(parseAdminMarkdown('hello world')).toEqual([{ kind: 'text', value: 'hello world' }]);
    });

    it('returns an empty array for an empty body', () => {
      expect(parseAdminMarkdown('')).toEqual([]);
    });
  });

  describe('bold', () => {
    it('recognises **double asterisks**', () => {
      expect(parseAdminMarkdown('a **bold** b')).toEqual([
        { kind: 'text', value: 'a ' },
        { kind: 'bold', value: 'bold' },
        { kind: 'text', value: ' b' },
      ]);
    });

    it('recognises __double underscores__', () => {
      expect(parseAdminMarkdown('__bold__')).toEqual([{ kind: 'bold', value: 'bold' }]);
    });

    it('leaves unmatched ** as literal text', () => {
      expect(parseAdminMarkdown('one ** two')).toEqual([{ kind: 'text', value: 'one ** two' }]);
    });

    it('does not match an empty **** bold span', () => {
      // The literal `**` with no inner content has nowhere to anchor a
      // bold node; the parser may still surface part of it via the em
      // rule, but it must not produce a `kind: 'bold'` span.
      const nodes = parseAdminMarkdown('a ****  b');
      expect(nodes.some((n) => n.kind === 'bold')).toBe(false);
    });
  });

  describe('emphasis', () => {
    it('recognises *single asterisks*', () => {
      expect(parseAdminMarkdown('a *em* b')).toEqual([
        { kind: 'text', value: 'a ' },
        { kind: 'em', value: 'em' },
        { kind: 'text', value: ' b' },
      ]);
    });

    it('recognises _single underscores_', () => {
      expect(parseAdminMarkdown('_em_')).toEqual([{ kind: 'em', value: 'em' }]);
    });

    it('prefers bold over emphasis when both delimiters could match', () => {
      expect(parseAdminMarkdown('**strong**')).toEqual([{ kind: 'bold', value: 'strong' }]);
    });
  });

  describe('links', () => {
    it('parses an internal absolute path as not external', () => {
      expect(parseAdminMarkdown('see [our roster](/artists)')).toEqual([
        { kind: 'text', value: 'see ' },
        { kind: 'link', text: 'our roster', href: '/artists', external: false },
      ]);
    });

    it('classifies an http URL with a different host as external', () => {
      const nodes = parseAdminMarkdown('[wiki](https://en.wikipedia.org/wiki/Hip_hop)', {
        siteHost: 'fakefourrecords.com',
      });
      expect(nodes).toEqual([
        {
          kind: 'link',
          text: 'wiki',
          href: 'https://en.wikipedia.org/wiki/Hip_hop',
          external: true,
        },
      ]);
    });

    it('classifies an http URL matching the site host as internal', () => {
      const nodes = parseAdminMarkdown('[home](https://fakefourrecords.com/about)', {
        siteHost: 'fakefourrecords.com',
      });
      expect(nodes).toEqual([
        {
          kind: 'link',
          text: 'home',
          href: 'https://fakefourrecords.com/about',
          external: false,
        },
      ]);
    });

    it('ignores port when comparing hostnames', () => {
      const nodes = parseAdminMarkdown('[dev](http://localhost:3001/x)', {
        siteHost: 'localhost:3000',
      });
      expect(nodes[0]).toMatchObject({ kind: 'link', external: false });
    });

    it('treats mailto: as external', () => {
      const nodes = parseAdminMarkdown('[mail](mailto:hi@example.com)');
      expect(nodes[0]).toMatchObject({ kind: 'link', external: true });
    });

    it('drops javascript: links to plain text', () => {
      const nodes = parseAdminMarkdown('[boom](javascript:alert(1))');
      expect(nodes).toEqual([{ kind: 'text', value: '[boom](javascript:alert(1))' }]);
    });

    it('drops data: links to plain text', () => {
      const nodes = parseAdminMarkdown('[x](data:text/html,<script>1</script>)');
      expect(nodes[0]).toEqual({ kind: 'text', value: '[x](data:text/html,<script>1</script>)' });
    });

    it('does not span newlines when looking for the closing bracket', () => {
      expect(parseAdminMarkdown('[broken\nlink](/foo)')).toEqual([
        { kind: 'text', value: '[broken\nlink](/foo)' },
      ]);
    });

    it('drops empty-text links', () => {
      expect(parseAdminMarkdown('[](/foo)')).toEqual([{ kind: 'text', value: '[](/foo)' }]);
    });

    it('treats absolute URL without siteHost as external (safe default)', () => {
      const nodes = parseAdminMarkdown('[x](https://example.com/y)');
      expect(nodes[0]).toMatchObject({ external: true });
    });
  });

  describe('mixed content', () => {
    it('keeps mention syntax verbatim inside bold/em/link payloads', () => {
      expect(parseAdminMarkdown('hi **@alice**, see [@bob](/u/bob) _now_')).toEqual([
        { kind: 'text', value: 'hi ' },
        { kind: 'bold', value: '@alice' },
        { kind: 'text', value: ', see ' },
        { kind: 'link', text: '@bob', href: '/u/bob', external: false },
        { kind: 'text', value: ' ' },
        { kind: 'em', value: 'now' },
      ]);
    });
  });
});
