/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import {
  Fragment,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { PLAYLIST_SEARCH_MIN_QUERY_LENGTH } from '@/lib/constants/playlists';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { usePlaylistMediaSearchQuery } from './_hooks/use-playlist-media-search-query';
import { PlaylistDuplicateConfirmDialog } from './playlist-duplicate-confirm-dialog';
import { PlaylistPickerCombobox } from './playlist-picker-combobox';
import { PlaylistSearchResultRow } from './playlist-search-result-row';
import { useAddToOtherPlaylist } from './use-add-to-other-playlist';

/** Imperative surface exposed by {@link PlaylistCreatorSearch} via `ref`. */
export interface PlaylistCreatorSearchHandle {
  /** Focuses the search input (e.g. the save dialog's "Add songs" button). */
  focus: () => void;
}

interface PlaylistCreatorSearchProps {
  /** Fired when a result row is selected — the creator stages/persists the item. */
  onAdd: (item: PlaylistSearchItem) => void;
  /** Fired by a row's "New playlist from this song" secondary action. */
  onNewPlaylist: (item: PlaylistSearchItem) => void;
  /** React 19 ref-as-prop exposing {@link PlaylistCreatorSearchHandle}. */
  ref?: Ref<PlaylistCreatorSearchHandle>;
}

const SEARCH_PLACEHOLDER = 'Search songs and videos…';

interface SearchStatusProps {
  hasQuery: boolean;
  isSearching: boolean;
}

/**
 * Status line under the input: hint while the query is too short, "Searching…"
 * while the first fetch for a query is in flight, otherwise the cmdk empty
 * state (auto-hidden by cmdk whenever result rows are rendered).
 */
const PlaylistSearchStatus = ({ hasQuery, isSearching }: SearchStatusProps): ReactElement => {
  if (!hasQuery) {
    return (
      <div className="py-6 text-center text-sm text-zinc-500">
        Search songs, videos, artists, releases…
      </div>
    );
  }
  if (isSearching) {
    return <div className="py-6 text-center text-sm text-zinc-500">Searching…</div>;
  }
  return <CommandEmpty>No matches found.</CommandEmpty>;
};

/**
 * Grouped media-search combobox inside the playlist creator — an inline cmdk
 * `Command` (no popover; the creator owns the layout). Types are debounced
 * 300ms into `usePlaylistMediaSearchQuery`; non-empty groups render in
 * response order. Selecting a row fires `onAdd`; each row also offers "New
 * playlist from this song" and an inline "Add to another playlist" picker
 * (one open at a time) with duplicate-confirm + force retry handled by
 * {@link useAddToOtherPlaylist}.
 */
export const PlaylistCreatorSearch = ({
  onAdd,
  onNewPlaylist,
  ref,
}: PlaylistCreatorSearchProps): ReactElement => {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounce(search, 300);
  const { isPending, data } = usePlaylistMediaSearchQuery(debounced);
  const {
    openPickerKey,
    togglePicker,
    pickPlaylist,
    duplicateItemTitle,
    confirmDuplicate,
    dismissDuplicate,
  } = useAddToOtherPlaylist();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const hasQuery = debounced.trim().length >= PLAYLIST_SEARCH_MIN_QUERY_LENGTH;
  const groups = (data?.groups ?? []).filter((group) => group.items.length > 0);

  const handleDuplicateOpenChange = (open: boolean): void => {
    if (!open) dismissDuplicate();
  };

  return (
    <>
      <Command shouldFilter={false}>
        <CommandInput
          ref={inputRef}
          value={search}
          onValueChange={setSearch}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label="Search songs and videos"
        />
        <CommandList>
          <PlaylistSearchStatus hasQuery={hasQuery} isSearching={isPending} />
          {hasQuery &&
            groups.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.items.map((item) => (
                  <Fragment key={item.key}>
                    <PlaylistSearchResultRow
                      item={item}
                      onAdd={() => onAdd(item)}
                      onNewPlaylist={() => onNewPlaylist(item)}
                      onAddToOther={() => togglePicker(item)}
                    />
                    {openPickerKey === item.key && (
                      <div className="border-b px-2 pb-2">
                        <PlaylistPickerCombobox onPick={pickPlaylist} />
                      </div>
                    )}
                  </Fragment>
                ))}
              </CommandGroup>
            ))}
        </CommandList>
      </Command>
      <PlaylistDuplicateConfirmDialog
        open={duplicateItemTitle !== null}
        onOpenChange={handleDuplicateOpenChange}
        itemTitle={duplicateItemTitle ?? ''}
        onConfirm={confirmDuplicate}
      />
    </>
  );
};
