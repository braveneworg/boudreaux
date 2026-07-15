/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useRef, useState, type ReactElement } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { toast } from 'sonner';

import { MyPlaylistSearch } from './my-playlist-search';
import { PlaylistCreator, type PlaylistCreatorHandle } from './playlist-creator';
import { PlaylistList } from './playlist-list';
import { PlaylistPlayerDialog } from './playlist-player-dialog';
import { PlaylistView } from './playlist-view';

/** Below this media query the layout is single-column (creator above list). */
const BELOW_LG_QUERY = '(max-width: 1023px)';

/**
 * Client island for `/playlists`: the creator (left) beside the My Playlists
 * list (right) on desktop, stacked on mobile with a quick-jump search and a
 * creator/&lt;playlist&gt; view swap (the creator stays mounted in a hidden
 * wrapper so drafts survive). A `?edit=` deep link loads that playlist into
 * the creator and is cleared from the URL once handled; play opens the shared
 * `PlaylistPlayerDialog`, while share remains a toast stub until sharing
 * lands later in PR2.
 */
export const PlaylistsContent = (): ReactElement => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get('edit');
  const [viewPlaylistId, setViewPlaylistId] = useState<string | null>(null);
  const [playerPlaylistId, setPlayerPlaylistId] = useState<string | null>(null);
  const creatorRef = useRef<PlaylistCreatorHandle>(null);
  const creatorPaneRef = useRef<HTMLDivElement>(null);

  const handleEditHandled = (): void => router.replace('/playlists', { scroll: false });

  /** Shared by list rows and the view: open the playlist in the creator. */
  const handleEdit = (id: string): void => {
    setViewPlaylistId(null);
    router.replace(`/playlists?edit=${id}`, { scroll: false });
    if (globalThis.matchMedia(BELOW_LG_QUERY).matches) {
      creatorPaneRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  /** Shared by list rows and the view: open the playlist in the player dialog. */
  const handlePlay = (id: string): void => setPlayerPlaylistId(id);

  const handlePlayerOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) setPlayerPlaylistId(null);
  };

  const handleShare = (): void => {
    toast.info('Sharing arrives in the next update');
  };

  const handleBackToCreator = (): void => setViewPlaylistId(null);

  return (
    <>
      <MyPlaylistSearch className="lg:hidden" onSelect={setViewPlaylistId} />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
        <div ref={creatorPaneRef}>
          {viewPlaylistId ? (
            <PlaylistView
              playlistId={viewPlaylistId}
              onBackToCreator={handleBackToCreator}
              onEdit={handleEdit}
              onPlay={handlePlay}
            />
          ) : null}
          <div className={viewPlaylistId ? 'hidden' : undefined}>
            <PlaylistCreator
              ref={creatorRef}
              editPlaylistId={editParam}
              onEditHandled={handleEditHandled}
            />
          </div>
        </div>
        <PlaylistList
          className="mt-8 lg:mt-0 lg:max-h-[75vh] lg:overflow-y-auto"
          onEdit={handleEdit}
          onPlay={handlePlay}
          onShare={handleShare}
        />
      </div>
      <PlaylistPlayerDialog
        playlistId={playerPlaylistId}
        open={playerPlaylistId !== null}
        onOpenChange={handlePlayerOpenChange}
      />
    </>
  );
};
