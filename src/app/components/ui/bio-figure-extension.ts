/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { BioFigureNodeView } from './bio-figure-node-view';

import type { DOMOutputSpec } from '@tiptap/pm/model';

export type BioFigureFloat = 'left' | 'right' | 'none';

export const FLOAT_TO_CLASS: Record<BioFigureFloat, string> = {
  left: 'bio-figure--left',
  right: 'bio-figure--right',
  none: 'bio-figure--center',
};

export const BIO_FIGURE_MIN_WIDTH = 20;
export const BIO_FIGURE_MAX_WIDTH = 100;

/** Rounds a percentage width and clamps it into the figure's 20–100 range. */
export const clampFigureWidth = (value: number): number =>
  Math.min(BIO_FIGURE_MAX_WIDTH, Math.max(BIO_FIGURE_MIN_WIDTH, Math.round(value)));

export interface BioFigureAttributes {
  src: string;
  alt: string;
  width: number;
  float: BioFigureFloat;
  title: string | null;
  subtitle: string | null;
  attribution: string | null;
}

/** Static-key lookup into FLOAT_TO_CLASS (dynamic indexing trips the
 *  `security/detect-object-injection` lint despite the closed union key). */
export const classForFloat = (float: BioFigureFloat): string => {
  if (float === 'left') return FLOAT_TO_CLASS.left;
  if (float === 'right') return FLOAT_TO_CLASS.right;
  return FLOAT_TO_CLASS.none;
};

const parseFloatClass = (element: HTMLElement): BioFigureFloat => {
  if (element.classList.contains('bio-figure--left')) return 'left';
  if (element.classList.contains('bio-figure--right')) return 'right';
  return 'none';
};

const parseCaptionText = (element: HTMLElement, selector: string): string | null => {
  const text = element.querySelector(selector)?.textContent?.trim();
  return text ? text : null;
};

const parseFigureAttributes = (element: HTMLElement): BioFigureAttributes | false => {
  const img = element.querySelector('img');
  if (!img) return false;
  const src = img.getAttribute('src');
  if (!src) return false;
  const widthMatch = /^([\d.]+)%$/.exec(element.style.width);
  return {
    src,
    alt: img.getAttribute('alt') ?? '',
    width: widthMatch ? clampFigureWidth(Number(widthMatch[1])) : 100,
    float: parseFloatClass(element),
    title: parseCaptionText(element, '.bio-figure-title'),
    subtitle: parseCaptionText(element, '.bio-figure-subtitle'),
    attribution: parseCaptionText(element, '.bio-figure-attribution'),
  };
};

type CaptionSpan = [string, { class: string }, string];

const buildCaptionSpans = ({
  title,
  subtitle,
  attribution,
}: Pick<BioFigureAttributes, 'title' | 'subtitle' | 'attribution'>): CaptionSpan[] => {
  const entries: [string, string | null][] = [
    ['bio-figure-title', title],
    ['bio-figure-subtitle', subtitle],
    ['bio-figure-attribution', attribution],
  ];
  return entries.flatMap(([className, text]): CaptionSpan[] =>
    text ? [['span', { class: className }, text]] : []
  );
};

/**
 * Block-level figure node for bio images: `figure > img + figcaption` with a
 * percentage width, float side, and up to three caption lines. Atomic and
 * draggable — ProseMirror-native drag repositions it with live text reflow.
 * Emits exactly the sanitizer's figure contract (sanitize-bio-html.ts).
 * The NodeView is layered on separately; headless parse/render lives here.
 */
export const BioFigure = Node.create({
  name: 'bioFigure',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      width: { default: 100 },
      float: { default: 'none' },
      title: { default: null },
      subtitle: { default: null },
      attribution: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'figure.bio-figure', getAttrs: parseFigureAttributes }];
  },

  renderHTML({ node }): DOMOutputSpec {
    const attrs = node.attrs as BioFigureAttributes;
    const { src, alt, width, float } = attrs;
    const spans = buildCaptionSpans(attrs);
    const children: DOMOutputSpec[] = [['img', { src, alt }]];
    if (spans.length > 0) {
      children.push(['figcaption', { class: 'bio-figure-caption' }, ...spans]);
    }
    return [
      'figure',
      { class: `bio-figure ${classForFloat(float)}`, style: `width: ${width}%` },
      ...children,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BioFigureNodeView);
  },
});
