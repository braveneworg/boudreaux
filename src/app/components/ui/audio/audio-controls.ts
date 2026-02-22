/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// NOTE: video.js components must use classes that extend from Video.js base components
// — this is the required pattern for Video.js custom controls.

// We lazily create and cache the component classes because `videojs.getComponent('Button')`
// may not be available at module-evaluation time (e.g. during SSR or when client-side
// navigating to a page that imports this module before video.js is fully initialised).

import videojs from 'video.js';

import type Player from 'video.js/dist/types/player';

type VideoJSComponent = ReturnType<typeof videojs.getComponent>;

let _AudioRewindButton: VideoJSComponent | null = null;
let _AudioFastForwardButton: VideoJSComponent | null = null;
let _SkipPreviousButton: VideoJSComponent | null = null;
let _SkipNextButton: VideoJSComponent | null = null;
let _classesBuilt = false;

/**
 * Forces the cached classes to be rebuilt on the next call to ensureClasses().
 * Call this before re-registering components (e.g. after client-side navigation).
 */
export const resetClasses = (): void => {
  _classesBuilt = false;
  _AudioRewindButton = null;
  _AudioFastForwardButton = null;
  _SkipPreviousButton = null;
  _SkipNextButton = null;
};

/**
 * Lazily builds and caches the custom Video.js button classes.
 * Must only be called when video.js is fully loaded (i.e. inside a useEffect
 * or after the video.js player has been created).
 *
 * Re-validates on every call to handle Video.js internal state resets
 * during Next.js client-side navigation.
 */
export const ensureClasses = (): void => {
  const Button = videojs.getComponent('Button');
  if (!Button) {
    resetClasses();
    return;
  }

  if (_classesBuilt) return;

  _AudioRewindButton = class extends Button {
    private seconds: number;

    constructor(player: Player, options?: Record<string, unknown>) {
      const secondsValue = options?.seconds ?? 15;
      const seconds = typeof secondsValue === 'number' ? secondsValue : 15;
      super(player, options);
      this.seconds = seconds;
    }

    buildCSSClass() {
      return `vjs-audio-rewind-control ${super.buildCSSClass()}`;
    }

    handleClick() {
      const currentTime = this.player().currentTime() || 0;
      this.player().currentTime(Math.max(0, currentTime - this.seconds));
    }

    createEl() {
      const seconds =
        (this as unknown as { options_: Record<string, unknown> }).options_.seconds ||
        this.seconds ||
        15;
      const el = super.createEl('button', {
        className: 'vjs-audio-rewind-control vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path fill="currentColor" d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              <text x="12" y="16" text-anchor="middle" font-size="8" fill="currentColor" font-weight="bold">${seconds}</text>
            </svg>
          </span>
          <span class="vjs-control-text" aria-live="polite">Rewind ${seconds} seconds</span>
        `,
      }) as HTMLButtonElement;
      el.setAttribute('type', 'button');
      el.setAttribute('aria-label', `Rewind ${seconds} seconds`);
      return el;
    }
  } as unknown as VideoJSComponent;

  _AudioFastForwardButton = class extends Button {
    private seconds: number;

    constructor(player: Player, options?: Record<string, unknown>) {
      const secondsValue = options?.seconds ?? 15;
      const seconds = typeof secondsValue === 'number' ? secondsValue : 15;
      super(player, options);
      this.seconds = seconds;
    }

    buildCSSClass() {
      return `vjs-audio-fast-forward-control ${super.buildCSSClass()}`;
    }

    handleClick() {
      const currentTime = this.player().currentTime() || 0;
      const duration = this.player().duration() || 0;
      this.player().currentTime(Math.min(duration, currentTime + this.seconds));
    }

    createEl() {
      const seconds =
        (this as unknown as { options_: Record<string, unknown> }).options_.seconds ||
        this.seconds ||
        15;
      const el = super.createEl('button', {
        className: 'vjs-audio-fast-forward-control vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path fill="currentColor" d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
              <text x="12" y="16" text-anchor="middle" font-size="8" fill="currentColor" font-weight="bold">${seconds}</text>
            </svg>
          </span>
          <span class="vjs-control-text" aria-live="polite">Fast forward ${seconds} seconds</span>
        `,
      }) as HTMLButtonElement;
      el.setAttribute('type', 'button');
      el.setAttribute('aria-label', `Fast forward ${seconds} seconds`);
      return el;
    }
  } as unknown as VideoJSComponent;

  _SkipPreviousButton = class extends Button {
    constructor(player: Player, options: Record<string, unknown> = {}) {
      super(player, options);
    }

    buildCSSClass() {
      return `vjs-skip-previous-control ${super.buildCSSClass()}`;
    }

    handleClick() {
      this.player().trigger('skipprevious');
    }

    createEl() {
      const el = super.createEl('button', {
        className: 'vjs-skip-previous-control vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </span>
          <span class="vjs-control-text" aria-live="polite">Previous Track</span>
        `,
      }) as HTMLButtonElement;
      el.setAttribute('type', 'button');
      el.setAttribute('aria-label', 'Previous track');
      return el;
    }
  } as unknown as VideoJSComponent;

  _SkipNextButton = class extends Button {
    constructor(player: Player, options: Record<string, unknown> = {}) {
      super(player, options);
    }

    buildCSSClass() {
      return `vjs-skip-next-control ${super.buildCSSClass()}`;
    }

    handleClick() {
      this.player().trigger('skipnext');
    }

    createEl() {
      const el = super.createEl('button', {
        className: 'vjs-skip-next-control vjs-control vjs-button',
        innerHTML: `
          <span class="vjs-icon-placeholder" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </span>
          <span class="vjs-control-text" aria-live="polite">Next Track</span>
        `,
      }) as HTMLButtonElement;
      el.setAttribute('type', 'button');
      el.setAttribute('aria-label', 'Next track');
      return el;
    }
  } as unknown as VideoJSComponent;

  _classesBuilt = true;
};

/** Public getters that lazily initialise the classes on first access. */
export const getAudioRewindButton = (): VideoJSComponent | null => {
  ensureClasses();
  return _AudioRewindButton;
};

export const getAudioFastForwardButton = (): VideoJSComponent | null => {
  ensureClasses();
  return _AudioFastForwardButton;
};

export const getSkipPreviousButton = (): VideoJSComponent | null => {
  ensureClasses();
  return _SkipPreviousButton;
};

export const getSkipNextButton = (): VideoJSComponent | null => {
  ensureClasses();
  return _SkipNextButton;
};
