/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useFeaturedPlayerStore } from './use-featured-player-store';

describe('useFeaturedPlayerStore', () => {
  it('starts with no selection and idle playback', () => {
    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBeNull();
    expect(state.currentFileId).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.shouldAutoPlay).toBe(false);
    expect(state.playerControls).toBeNull();
  });

  it('selectArtist sets the selection trio atomically', () => {
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-9', true);

    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBe('artist-1');
    expect(state.currentFileId).toBe('file-9');
    expect(state.shouldAutoPlay).toBe(true);
  });

  it('selectFile changes only the file and autoplay intent', () => {
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-1', false);
    useFeaturedPlayerStore.getState().selectFile('file-2', true);

    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBe('artist-1');
    expect(state.currentFileId).toBe('file-2');
    expect(state.shouldAutoPlay).toBe(true);
  });

  it('resetPlayback clears playback state but keeps the selection', () => {
    const controls = { play: vi.fn(), pause: vi.fn(), toggle: vi.fn() };
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-1', true);
    useFeaturedPlayerStore.getState().setIsPlaying(true);
    useFeaturedPlayerStore.getState().setPlayerControls(controls);

    useFeaturedPlayerStore.getState().resetPlayback();

    const state = useFeaturedPlayerStore.getState();
    expect(state.selectedArtistId).toBe('artist-1');
    expect(state.currentFileId).toBe('file-1');
    expect(state.isPlaying).toBe(false);
    expect(state.shouldAutoPlay).toBe(false);
    expect(state.playerControls).toBeNull();
  });

  it('never touches browser storage (in-memory only)', () => {
    useFeaturedPlayerStore.getState().selectArtist('artist-1', 'file-1', false);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
