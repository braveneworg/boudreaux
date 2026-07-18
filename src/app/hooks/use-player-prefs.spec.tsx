/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bindPlayerVolumePersistence, usePlayerPrefs } from './use-player-prefs';

import type Player from 'video.js/dist/types/player';

const STORAGE_KEY = 'boudreaux-player-prefs';

interface FakeVolumePlayer {
  ready: (callback: () => void) => void;
  on: (event: string, callback: () => void) => void;
  volume: (value?: number) => number | undefined;
  muted: (value?: boolean) => boolean | undefined;
  /** Test-only: fire a registered event's handlers. */
  trigger: (event: string) => void;
}

/** Minimal stateful Video.js volume surface: ready runs immediately, volume/muted
 *  are getter-setters, trigger fires registered handlers. */
const makeFakePlayer = (initial: { volume: number; muted: boolean }): FakeVolumePlayer => {
  const handlers = new Map<string, Array<() => void>>();
  let currentVolume = initial.volume;
  let currentMuted = initial.muted;
  return {
    ready: (callback) => callback(),
    on: (event, callback) => {
      const existing = handlers.get(event) ?? [];
      existing.push(callback);
      handlers.set(event, existing);
    },
    volume: (value?: number) => {
      if (value !== undefined) {
        currentVolume = value;
        return undefined;
      }
      return currentVolume;
    },
    muted: (value?: boolean) => {
      if (value !== undefined) {
        currentMuted = value;
        return undefined;
      }
      return currentMuted;
    },
    trigger: (event) => handlers.get(event)?.forEach((callback) => callback()),
  };
};

const asPlayer = (fake: FakeVolumePlayer): Player => fake as unknown as Player;

describe('usePlayerPrefs', () => {
  it('defaults to full volume, unmuted', () => {
    expect(usePlayerPrefs.getState().volume).toBe(1);
    expect(usePlayerPrefs.getState().muted).toBe(false);
  });

  it('clamps setVolume into the 0..1 range', () => {
    usePlayerPrefs.getState().setVolume(1.7);
    expect(usePlayerPrefs.getState().volume).toBe(1);
    usePlayerPrefs.getState().setVolume(-0.2);
    expect(usePlayerPrefs.getState().volume).toBe(0);
    usePlayerPrefs.getState().setVolume(0.42);
    expect(usePlayerPrefs.getState().volume).toBe(0.42);
  });

  it('persists volume and muted (and only those) to localStorage', () => {
    usePlayerPrefs.getState().setVolume(0.3);
    usePlayerPrefs.getState().setMuted(true);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw ?? '{}') as { state: Record<string, unknown>; version: number };
    expect(envelope.version).toBe(1);
    expect(envelope.state).toEqual({ volume: 0.3, muted: true });
  });

  it('migrate falls back to defaults for unknown persisted shapes', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { volume: 'loud', muted: 'yes' }, version: 0 })
    );

    await usePlayerPrefs.persist?.rehydrate();

    expect(usePlayerPrefs.getState().volume).toBe(1);
    expect(usePlayerPrefs.getState().muted).toBe(false);
  });
});

describe('bindPlayerVolumePersistence', () => {
  it('applies stored volume and muted when the player is ready', () => {
    usePlayerPrefs.getState().setVolume(0.4);
    usePlayerPrefs.getState().setMuted(true);
    const fake = makeFakePlayer({ volume: 1, muted: false });

    bindPlayerVolumePersistence(asPlayer(fake));

    expect(fake.volume()).toBe(0.4);
    expect(fake.muted()).toBe(true);
  });

  it('writes the player values back to the store on volumechange', () => {
    const fake = makeFakePlayer({ volume: 1, muted: false });
    bindPlayerVolumePersistence(asPlayer(fake));

    fake.volume(0.65);
    fake.muted(true);
    fake.trigger('volumechange');

    expect(usePlayerPrefs.getState().volume).toBe(0.65);
    expect(usePlayerPrefs.getState().muted).toBe(true);
  });

  it('the apply-on-ready echo does not corrupt the stored values', () => {
    usePlayerPrefs.getState().setVolume(0.25);
    const fake = makeFakePlayer({ volume: 1, muted: false });

    bindPlayerVolumePersistence(asPlayer(fake));
    // Video.js fires volumechange for the programmatic apply too.
    fake.trigger('volumechange');

    expect(usePlayerPrefs.getState().volume).toBe(0.25);
    expect(usePlayerPrefs.getState().muted).toBe(false);
  });
});
