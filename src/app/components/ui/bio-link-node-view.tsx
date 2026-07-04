/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { BioLinkAttributes, BioLinkOptions } from './bio-link-extension';
import type { NodeViewProps } from '@tiptap/react';

/**
 * Inline NodeView for {@link BioLink}: the anchor text renders as an underlined
 * link-colored button that opens the link dialog when clicked (or via keyboard),
 * with an external-tab icon when applicable and a hover/selection X to remove
 * the node. The whole unit drags with ProseMirror's native atom drag.
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

  const requestEdit = (): void => {
    const pos = getPos();
    if (typeof pos === 'number') onEditRequest(pos);
  };

  return (
    <NodeViewWrapper
      as="span"
      data-drag-handle
      data-testid="bio-link-node"
      data-selected={selected ? true : undefined}
      className={cn(
        'group/biolink relative inline-flex cursor-grab items-baseline gap-0.5',
        'text-primary underline underline-offset-2 active:cursor-grabbing',
        selected && 'ring-ring bg-accent/40 ring-2'
      )}
      title={href}
    >
      {/* The anchor text is the click-to-edit control: clicking (or Enter/Space
          on keyboard) opens the link dialog. Drag still repositions the whole
          atom via the wrapper's data-drag-handle. */}
      <button
        type="button"
        onClick={requestEdit}
        aria-label={`Edit link ${text}`}
        className="inline-flex cursor-pointer items-baseline gap-0.5 underline underline-offset-2"
      >
        <span>{text}</span>
        {external && <ExternalLink data-external-icon className="size-3 self-center" aria-hidden />}
      </button>
      <span
        className={cn(
          'bg-popover absolute -top-6 left-0 z-10 hidden items-center gap-0.5 border p-0.5 shadow-sm',
          'group-hover/biolink:inline-flex group-data-selected/biolink:inline-flex'
        )}
        contentEditable={false}
      >
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
