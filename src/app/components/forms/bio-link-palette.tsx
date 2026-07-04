/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { DragEvent, JSX } from 'react';

import { ExternalLink, Plus, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

interface BioLinkPaletteProps {
  links: BioStatusLink[];
  onDelete: (linkId: string) => void;
  onInsert: (link: BioStatusLink) => void;
  disabled?: boolean;
}

/** Curated, draggable list of discovered links. Tiles drag into the bio
 *  editors as `application/x-bio-link` payloads; the Plus button inserts
 *  at the focused editor's cursor (touch/keyboard path); X deletes the row. */
export const BioLinkPalette = ({
  links,
  onDelete,
  onInsert,
  disabled = false,
}: BioLinkPaletteProps): JSX.Element => {
  const [filter, setFilter] = useState('');

  const lower = filter.toLowerCase();
  const visible = lower
    ? links.filter(
        (link) =>
          link.label.toLowerCase().includes(lower) ||
          (link.kind ?? '').toLowerCase().includes(lower)
      )
    : links;

  return (
    <div role="group" aria-label="Discovered links" className="space-y-2">
      <h3 className="text-sm font-semibold">Discovered links ({links.length})</h3>
      <Input
        aria-label="Filter links"
        placeholder="Filter…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="h-7 text-xs"
      />
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {visible.map((link) => {
          const isExternal = !isInternalBioUrl(link.url);
          const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
            event.dataTransfer.setData(
              BIO_LINK_DRAG_MIME,
              JSON.stringify({
                label: link.label,
                url: link.url,
                kind: link.kind ?? null,
                isExternal,
              })
            );
            event.dataTransfer.effectAllowed = 'copy';
          };
          return (
            <li
              key={link.id}
              draggable
              onDragStart={onDragStart}
              className="border-border bg-background flex cursor-grab items-center gap-2 border px-2 py-1.5 text-sm active:cursor-grabbing"
            >
              {isExternal && (
                <ExternalLink
                  data-external-icon
                  className="text-muted-foreground size-3.5 shrink-0"
                  aria-hidden
                />
              )}
              <span className="truncate">{link.label}</span>
              {link.kind && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {link.kind}
                </Badge>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onInsert(link)}
                aria-label={`Insert link ${link.label}`}
                className="hover:text-primary ml-auto shrink-0 p-0.5"
              >
                <Plus className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(link.id)}
                aria-label={`Delete link ${link.label}`}
                className="hover:text-destructive shrink-0 p-0.5"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
