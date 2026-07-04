/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';

import { BioFigure, FLOAT_TO_CLASS, clampFigureWidth } from './bio-figure-extension';

import type { BioFigureAttributes } from './bio-figure-extension';

const createEditor = (content: string): Editor =>
  new Editor({ extensions: [StarterKit, BioFigure], content });

const FIGURE_HTML =
  '<figure class="bio-figure bio-figure--left" style="width: 45%"><img src="https://cdn.example/x.webp" alt="Ceschi live"><figcaption class="bio-figure-caption"><span class="bio-figure-title">Ceschi</span><span class="bio-figure-attribution">Wikimedia Commons</span></figcaption></figure>';

describe('BioFigure extension', () => {
  it('parses a figure into a bioFigure node with its attributes', () => {
    const editor = createEditor(FIGURE_HTML);
    const node = editor.state.doc.firstChild;
    expect(node?.type.name).toBe('bioFigure');
  });

  it('parses the img src into the src attribute', () => {
    const editor = createEditor(FIGURE_HTML);
    expect(editor.state.doc.firstChild?.attrs.src).toBe('https://cdn.example/x.webp');
  });

  it('parses the img alt into the alt attribute', () => {
    const editor = createEditor(FIGURE_HTML);
    expect(editor.state.doc.firstChild?.attrs.alt).toBe('Ceschi live');
  });

  it('parses the float class into the float attribute', () => {
    const editor = createEditor(FIGURE_HTML);
    expect(editor.state.doc.firstChild?.attrs.float).toBe('left');
  });

  it('parses the style width into the width attribute', () => {
    const editor = createEditor(FIGURE_HTML);
    expect(editor.state.doc.firstChild?.attrs.width).toBe(45);
  });

  it('round-trips float and width through getHTML', () => {
    const editor = createEditor(FIGURE_HTML);
    const html = editor.getHTML();
    expect(html).toContain('bio-figure--left');
  });

  it('round-trips the width style through getHTML', () => {
    const editor = createEditor(FIGURE_HTML);
    expect(editor.getHTML()).toContain('width: 45%');
  });

  it('round-trips caption spans', () => {
    const editor = createEditor(FIGURE_HTML);
    expect(editor.getHTML()).toContain('bio-figure-attribution');
  });

  it('omits the figcaption when no caption fields are set', () => {
    const editor = createEditor(
      '<figure class="bio-figure"><img src="https://cdn.example/x.webp" alt=""></figure>'
    );
    expect(editor.getHTML()).not.toContain('figcaption');
  });

  it('renders the center class when float is none', () => {
    const editor = createEditor(
      '<figure class="bio-figure"><img src="https://cdn.example/x.webp" alt=""></figure>'
    );
    expect(editor.getHTML()).toContain('bio-figure--center');
  });

  it('ignores a figure without an img src', () => {
    const editor = createEditor(
      '<figure class="bio-figure"><figcaption class="bio-figure-caption">x</figcaption></figure>'
    );
    expect(editor.state.doc.firstChild?.type.name).not.toBe('bioFigure');
  });

  it('clamps a parsed width below the floor to 20', () => {
    const editor = createEditor(
      '<figure class="bio-figure" style="width: 5%"><img src="https://cdn.example/x.webp" alt=""></figure>'
    );
    expect(editor.state.doc.firstChild?.attrs.width).toBe(20);
  });
});

const firstFigureAttrs = (editor: Editor): BioFigureAttributes | null => {
  let found: BioFigureAttributes | null = null;
  editor.state.doc.descendants((node) => {
    if (found === null && node.type.name === 'bioFigure') {
      found = node.attrs as BioFigureAttributes;
    }
  });
  return found;
};

describe('BioFigure legacy image adoption', () => {
  it('adopts a bare <img> into a bioFigure node', () => {
    const editor = createEditor('<img src="https://cdn.example/y.webp" alt="Legacy photo">');
    expect(firstFigureAttrs(editor)?.src).toBe('https://cdn.example/y.webp');
  });

  it('preserves the alt text when adopting a bare <img>', () => {
    const editor = createEditor('<img src="https://cdn.example/y.webp" alt="Legacy photo">');
    expect(firstFigureAttrs(editor)?.alt).toBe('Legacy photo');
  });

  it('defaults an adopted bare <img> to full width', () => {
    const editor = createEditor('<img src="https://cdn.example/y.webp" alt="">');
    expect(firstFigureAttrs(editor)?.width).toBe(100);
  });

  it('defaults an adopted bare <img> to no float', () => {
    const editor = createEditor('<img src="https://cdn.example/y.webp" alt="">');
    expect(firstFigureAttrs(editor)?.float).toBe('none');
  });

  it('upgrades an adopted bare <img> to figure markup on serialize', () => {
    const editor = createEditor('<img src="https://cdn.example/y.webp" alt="">');
    expect(editor.getHTML()).toContain('bio-figure');
  });

  it('adopts a bare <img> that sits among paragraphs', () => {
    const editor = createEditor('<p>Intro</p><img src="https://cdn.example/y.webp" alt="mid">');
    expect(firstFigureAttrs(editor)?.src).toBe('https://cdn.example/y.webp');
  });

  it('ignores a bare <img> with no src', () => {
    const editor = createEditor('<p>x</p><img alt="broken">');
    expect(firstFigureAttrs(editor)).toBeNull();
  });
});

describe('FLOAT_TO_CLASS', () => {
  it('maps left to bio-figure--left', () => {
    expect(FLOAT_TO_CLASS.left).toBe('bio-figure--left');
  });

  it('maps right to bio-figure--right', () => {
    expect(FLOAT_TO_CLASS.right).toBe('bio-figure--right');
  });

  it('maps none to bio-figure--center', () => {
    expect(FLOAT_TO_CLASS.none).toBe('bio-figure--center');
  });
});

describe('clampFigureWidth', () => {
  it('clamps values above the ceiling to 100', () => {
    expect(clampFigureWidth(140)).toBe(100);
  });

  it('rounds decimal values to the nearest integer', () => {
    expect(clampFigureWidth(45.6)).toBe(46);
  });
});
