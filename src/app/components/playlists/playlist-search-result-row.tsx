/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { MouseEvent, PointerEvent, ReactElement } from 'react';

import Image from 'next/image';

import { CopyPlus, ListPlus, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandItem } from '@/components/ui/command';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { formatDuration } from '@/lib/utils/format-duration';

interface PlaylistSearchResultRowProps {
  /** The media-search result to render. */
  item: PlaylistSearchItem;
  /** Fired when the row itself is selected (click or cmdk keyboard select). */
  onAdd: () => void;
  /** Fired by the `CopyPlus` secondary button. */
  onNewPlaylist: () => void;
  /** Fired by the `ListPlus` secondary button. */
  onAddToOther: () => void;
}

/** 40px square cover thumb with a muted fallback block when the item has no art. */
const ResultThumb = ({ coverArt }: { coverArt: string | null }): ReactElement =>
  coverArt ? (
    <Image
      src={coverArt}
      alt=""
      width={40}
      height={40}
      sizes="40px"
      className="size-10 shrink-0 object-cover"
    />
  ) : (
    <div aria-hidden="true" className="size-10 shrink-0 bg-zinc-200" />
  );

interface SecondaryActionProps {
  label: string;
  onAction: () => void;
  children: ReactElement;
}

/**
 * Right-edge icon button. Stops propagation on both click and pointerdown so
 * neither the cmdk row select nor outer layers (popovers, drawers) ever see
 * the interaction.
 */
const SecondaryAction = ({ label, onAction, children }: SecondaryActionProps): ReactElement => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="size-8 shrink-0"
    aria-label={label}
    onPointerDown={(event: PointerEvent<HTMLButtonElement>) => event.stopPropagation()}
    onClick={(event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onAction();
    }}
  >
    {children}
  </Button>
);

/**
 * One grouped media-search result inside the playlist creator's combobox.
 * Pure presentation: selecting the row (the whole row is the cmdk item)
 * fires `onAdd`; the two secondary buttons fire their callbacks without
 * bubbling into a row select.
 */
export const PlaylistSearchResultRow = ({
  item,
  onAdd,
  onNewPlaylist,
  onAddToOther,
}: PlaylistSearchResultRowProps): ReactElement => {
  const { key, itemType, title, artistName, coverArt, duration, context } = item;
  const subtext = context ?? artistName;

  return (
    <CommandItem value={key} onSelect={onAdd} className="gap-3">
      <Plus aria-hidden="true" className="shrink-0" />
      <ResultThumb coverArt={coverArt} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {itemType === 'video' && <Badge variant="secondary">video</Badge>}
        </span>
        {subtext && <span className="truncate text-xs text-zinc-500">{subtext}</span>}
      </div>
      <span className="shrink-0 text-xs text-zinc-500">{formatDuration(duration)}</span>
      <SecondaryAction label="New playlist from this song" onAction={onNewPlaylist}>
        <CopyPlus aria-hidden="true" />
      </SecondaryAction>
      <SecondaryAction label="Add to another playlist" onAction={onAddToOther}>
        <ListPlus aria-hidden="true" />
      </SecondaryAction>
    </CommandItem>
  );
};
