/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { isValidBioLinkUrl } from '@/lib/utils/is-valid-bio-link-url';

import { BioLinkNodeView } from './bio-link-node-view';

import type { DOMOutputSpec } from '@tiptap/pm/model';

export interface BioLinkAttributes {
  href: string;
  text: string;
  external: boolean;
}

export interface BioLinkOptions {
  /** Invoked by the NodeView's edit control with the node's document position. */
  onEditRequest: (pos: number) => void;
}

const parseAnchor = (element: HTMLElement): BioLinkAttributes | false => {
  const href = element.getAttribute('href');
  const text = element.textContent?.trim() ?? '';
  if (!href || !text) return false;
  if (!isValidBioLinkUrl(href)) return false;
  const external = element.getAttribute('target') === '_blank' || !isInternalBioUrl(href);
  return { href, text, external };
};

/**
 * Inline atom link node — a bio link behaves as one draggable unit with an
 * X-remove control, matching the figure interaction model. Serializes to the
 * exact `<a>` contract the sanitizer enforces (external: hardened rel/target;
 * internal: bare href), so persisted HTML and the public renderer are
 * unchanged, and legacy `<a>` content parses straight into it.
 */
export const BioLink = Node.create<BioLinkOptions>({
  name: 'bioLink',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onEditRequest: () => {} };
  },

  addAttributes() {
    return {
      href: { default: null },
      text: { default: '' },
      external: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]', getAttrs: parseAnchor }];
  },

  renderHTML({ node }): DOMOutputSpec {
    const { href, text, external } = node.attrs as BioLinkAttributes;
    return external
      ? ['a', { href, rel: 'nofollow noopener noreferrer', target: '_blank' }, text]
      : ['a', { href }, text];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BioLinkNodeView);
  },
});
