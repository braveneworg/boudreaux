/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import { ListPlus } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { PlaylistDuplicateConfirmDialog } from './playlist-duplicate-confirm-dialog';
import { PlaylistPickerCombobox } from './playlist-picker-combobox';
import { useAddToPlaylistFlow } from './use-add-to-playlist-flow';

interface AddToPlaylistPanelProps {
  /** The single fixed item every add in this panel targets. */
  item: PlaylistSearchItem;
  /** Opens the create-playlist flow — closing the popover is the parent's job. */
  onCreatePlaylist: () => void;
  /** Called after a successful add — e.g. to close the popover. */
  onAdded?: () => void;
}

/**
 * Body of the "add to playlist" kebab popover: a picker that adds the fixed
 * `item` to whichever playlist the user selects (via {@link useAddToPlaylistFlow},
 * including its duplicate-confirm dialog), plus a "Create playlist" shortcut the
 * parent wires to close this popover and open the create dialog.
 */
export const AddToPlaylistPanel = ({
  item,
  onCreatePlaylist,
  onAdded,
}: AddToPlaylistPanelProps): ReactElement => {
  const flow = useAddToPlaylistFlow({ item, onAdded });

  return (
    // This panel renders inside a portaled popover, outside the page's
    // ZinePanel, so it names the playlists accent itself — otherwise the
    // picker's focus ring falls back to the site-default pink.
    <div className="zine-accent-kraft flex w-full flex-col gap-2">
      <p className="px-2 text-sm font-semibold">Add to a playlist</p>
      {/* focusOnMount: this panel is lazy-loaded into an already-open popover,
          so Radix FocusScope's mount-time autofocus already ran (against the
          loading fallback) — the picker must take focus itself when it lands. */}
      <PlaylistPickerCombobox onPick={flow.pickPlaylist} focusOnMount />
      <Button variant="outline" className="w-full" onClick={onCreatePlaylist}>
        <ListPlus aria-hidden="true" />
        Create playlist
      </Button>
      <PlaylistDuplicateConfirmDialog
        open={flow.duplicateItemTitle !== null}
        onOpenChange={(o) => {
          if (!o) flow.dismissDuplicate();
        }}
        itemTitle={flow.duplicateItemTitle ?? ''}
        onConfirm={flow.confirmDuplicate}
      />
    </div>
  );
};
