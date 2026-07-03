/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { DragEvent, JSX } from 'react';

import { ExternalLink, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

interface BioLinkPaletteProps {
  links: BioStatusLink[];
  onDelete: (linkId: string) => void;
  disabled?: boolean;
}

/** Curated, draggable list of discovered links. Tiles drag into the bio
 *  editors as `application/x-bio-link` payloads; X deletes the row. */
export const BioLinkPalette = ({
  links,
  onDelete,
  disabled = false,
}: BioLinkPaletteProps): JSX.Element => (
  <div role="group" aria-label="Discovered links" className="space-y-2">
    <h3 className="text-sm font-semibold">Discovered links</h3>
    <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
      {links.map((link) => {
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
            className="border-border bg-background flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-sm active:cursor-grabbing"
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
              onClick={() => onDelete(link.id)}
              aria-label={`Delete link ${link.label}`}
              className="hover:text-destructive ml-auto shrink-0 rounded-full p-0.5"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);
