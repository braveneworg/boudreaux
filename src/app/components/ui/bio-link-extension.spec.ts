/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';

import { BioLink } from './bio-link-extension';

const makeEditor = (content: string): Editor =>
  new Editor({
    extensions: [Document, Paragraph, Text, BioLink.configure({ onEditRequest: () => {} })],
    content,
  });

describe('BioLink extension', () => {
  it('parses an external anchor into a bioLink node and round-trips the html', () => {
    const html =
      '<p>See <a href="https://zine.net/a" rel="nofollow noopener noreferrer" target="_blank">the interview</a>.</p>';
    const editor = makeEditor(html);
    const node = editor.state.doc.content.firstChild?.content.child(1);
    expect(node?.type.name).toBe('bioLink');
    expect(node?.attrs).toMatchObject({
      href: 'https://zine.net/a',
      text: 'the interview',
      external: true,
    });
    expect(editor.getHTML()).toContain(
      '<a href="https://zine.net/a" rel="nofollow noopener noreferrer" target="_blank">the interview</a>'
    );
  });

  it('parses an internal anchor and serializes without rel/target', () => {
    const editor = makeEditor('<p><a href="/releases/abc">Label Album</a></p>');
    expect(editor.getHTML()).toContain('<a href="/releases/abc">Label Album</a>');
    expect(editor.getHTML()).not.toContain('target=');
  });

  it('derives external=true from href when legacy anchors lack target', () => {
    const editor = makeEditor('<p><a href="https://zine.net/a">old link</a></p>');
    const node = editor.state.doc.content.firstChild?.content.child(0);
    expect(node?.attrs.external).toBe(true);
  });

  it('ignores anchors without an href', () => {
    const editor = makeEditor('<p><a>bare</a></p>');
    expect(editor.getHTML()).not.toContain('bioLink');
  });

  it('rejects a javascript: href — no bioLink node is created', () => {
    const editor = makeEditor('<p><a href="javascript:alert(1)">click</a></p>');
    const firstChild = editor.state.doc.content.firstChild?.firstChild;
    expect(firstChild?.type.name).not.toBe('bioLink');
  });

  it('rejects a data: href — no bioLink node is created', () => {
    const editor = makeEditor('<p><a href="data:text/html,<h1>x</h1>">click</a></p>');
    const firstChild = editor.state.doc.content.firstChild?.firstChild;
    expect(firstChild?.type.name).not.toBe('bioLink');
  });

  it('still parses valid https: hrefs into bioLink nodes after the guard', () => {
    const editor = makeEditor('<p><a href="https://example.com">link</a></p>');
    const node = editor.state.doc.content.firstChild?.firstChild;
    expect(node?.type.name).toBe('bioLink');
  });

  it('still parses site-relative /releases/... hrefs into bioLink nodes after the guard', () => {
    const editor = makeEditor('<p><a href="/releases/slug">link</a></p>');
    const node = editor.state.doc.content.firstChild?.firstChild;
    expect(node?.type.name).toBe('bioLink');
  });
});
