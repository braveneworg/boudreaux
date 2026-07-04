/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Pencil, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { BioLinkAttributes, BioLinkOptions } from './bio-link-extension';
import type { NodeViewProps } from '@tiptap/react';

/**
 * Inline NodeView for {@link BioLink}: the anchor text rendered as an
 * underlined link-colored unit, with an external-tab icon when applicable and
 * hover/selection controls to edit (via the link dialog) or remove the node.
 * The whole unit drags with ProseMirror's native atom drag.
 */
export const BioLinkNodeView = ({
  node,
  selected,
  deleteNode,
  getPos,
  extension,
}: NodeViewProps): JSX.Element => {
  const { href, text, external } = node.attrs as BioLinkAttributes;
  const { onEditRequest } = extension.options as BioLinkOptions;

  return (
    <NodeViewWrapper
      as="span"
      data-drag-handle
      data-selected={selected ? true : undefined}
      className={cn(
        'group/biolink relative inline-flex cursor-grab items-baseline gap-0.5',
        'text-primary underline underline-offset-2 active:cursor-grabbing',
        selected && 'ring-ring bg-accent/40 ring-2'
      )}
      title={href}
    >
      <span>{text}</span>
      {external && <ExternalLink data-external-icon className="size-3 self-center" aria-hidden />}
      <span
        className={cn(
          'bg-popover absolute -top-6 left-0 z-10 hidden items-center gap-0.5 border p-0.5 shadow-sm',
          'group-hover/biolink:inline-flex group-data-selected/biolink:inline-flex'
        )}
        contentEditable={false}
      >
        <button
          type="button"
          aria-label={`Edit link ${text}`}
          className="hover:text-primary p-0.5"
          onClick={() => {
            const pos = getPos();
            if (typeof pos === 'number') onEditRequest(pos);
          }}
        >
          <Pencil className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove link ${text}`}
          className="hover:text-destructive p-0.5"
          onClick={() => deleteNode()}
        >
          <X className="size-3" aria-hidden />
        </button>
      </span>
    </NodeViewWrapper>
  );
};
