/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { DragEvent, JSX } from 'react';

import { ExternalLink, Eye, Plus, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/app/components/ui/hover-card';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { CustomLinkEditor } from './custom-link-editor';
import { LinkPreviewCard } from './link-preview-card';

interface BioLinkPaletteProps {
  artistId: string;
  links: BioStatusLink[];
  onDelete: (linkId: string) => void;
  onInsert: (link: BioStatusLink) => void;
  disabled?: boolean;
}

interface LinkPreviewTriggerProps {
  url: string;
  label: string;
  disabled: boolean;
  isMobile: boolean;
}

/** Eye button that opens an unfurl preview for one external link. Holds its own
 *  open state so the `LinkPreviewCard` query stays idle until this row's card is
 *  opened. Desktop uses a hover card (hover/focus); mobile uses a popover (tap). */
const LinkPreviewTrigger = ({
  url,
  label,
  disabled,
  isMobile,
}: LinkPreviewTriggerProps): JSX.Element => {
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Preview link ${label}`}
      className="hover:text-primary shrink-0 p-0.5"
    >
      <Eye className="size-3.5" aria-hidden />
    </button>
  );

  const card = <LinkPreviewCard url={url} enabled={open} />;

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          {card}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent align="end" className="w-72">
        {card}
      </HoverCardContent>
    </HoverCard>
  );
};

/** Curated, draggable list of discovered links. Tiles drag into the bio
 *  editors as `application/x-bio-link` payloads; the Plus button inserts
 *  at the focused editor's cursor (touch/keyboard path); X deletes the row.
 *  External links also carry an Eye button that opens an unfurl preview. */
export const BioLinkPalette = ({
  artistId,
  links,
  onDelete,
  onInsert,
  disabled = false,
}: BioLinkPaletteProps): JSX.Element => {
  const [filter, setFilter] = useState('');
  const isMobile = useIsMobile();

  const lower = filter.toLowerCase();
  const filtered = lower
    ? links.filter(
        (link) =>
          link.label.toLowerCase().includes(lower) ||
          (link.kind ?? '').toLowerCase().includes(lower)
      )
    : links;
  const visible = [...filtered].sort(
    (a, b) => Number(b.origin === 'custom') - Number(a.origin === 'custom')
  );

  return (
    <div role="group" aria-label="Discovered links" className="space-y-2">
      <CustomLinkEditor artistId={artistId} />
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
              {link.origin === 'custom' && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  Custom
                </Badge>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {isExternal && (
                  <LinkPreviewTrigger
                    url={link.url}
                    label={link.label}
                    disabled={disabled}
                    isMobile={isMobile}
                  />
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onInsert(link)}
                  aria-label={`Insert link ${link.label}`}
                  className="hover:text-primary p-0.5"
                >
                  <Plus className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDelete(link.id)}
                  aria-label={`Delete link ${link.label}`}
                  className="hover:text-destructive p-0.5"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
