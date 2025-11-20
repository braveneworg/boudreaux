import videojs from 'video.js';

import type Player from 'video.js/dist/types/player';

const Button = videojs.getComponent('Button');

// Rewind Button for Audio
export class AudioRewindButton extends Button {
  private seconds: number;

  constructor(player: Player, options: any = {}) {
    super(player, options);
    this.seconds = options.seconds || 15;
  }

  buildCSSClass() {
    return `vjs-audio-rewind-control ${super.buildCSSClass()}`;
  }

  handleClick() {
    const currentTime = this.player().currentTime();
    if (currentTime && currentTime < this.seconds) {
      this.player().currentTime(Math.max(0, currentTime - this.seconds));
      return;
    }
  }

  createEl() {
    const el = super.createEl('button', {
      className: 'vjs-audio-rewind-control vjs-control vjs-button',
      innerHTML: `
        <span class="vjs-icon-placeholder" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path fill="currentColor" d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            <text x="12" y="16" text-anchor="middle" font-size="8" fill="currentColor" font-weight="bold">${this.seconds}</text>
          </svg>
        </span>
        <span class="vjs-control-text" aria-live="polite">Rewind ${this.seconds} seconds</span>
      `,
    }) as HTMLButtonElement;

    el.setAttribute('type', 'button');
    el.setAttribute('aria-label', `Rewind ${this.seconds} seconds`);

    return el;
  }
}

// Fast Forward Button for Audio
export class AudioFastForwardButton extends Button {
  private seconds: number;

  constructor(player: Player, options: any = {}) {
    super(player, options);
    this.seconds = options.seconds || 15;
  }

  buildCSSClass() {
    return `vjs-audio-fast-forward-control ${super.buildCSSClass()}`;
  }

  handleClick() {
    const currentTime = this.player().currentTime();
    const duration = this.player().duration();
    this.player().currentTime(Math.min(duration, currentTime + this.seconds));
  }

  createEl() {
    const el = super.createEl('button', {
      className: 'vjs-audio-fast-forward-control vjs-control vjs-button',
      innerHTML: `
        <span class="vjs-icon-placeholder" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path fill="currentColor" d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
            <text x="12" y="16" text-anchor="middle" font-size="8" fill="currentColor" font-weight="bold">${this.seconds}</text>
          </svg>
        </span>
        <span class="vjs-control-text" aria-live="polite">Fast forward ${this.seconds} seconds</span>
      `,
    }) as HTMLButtonElement;

    el.setAttribute('type', 'button');
    el.setAttribute('aria-label', `Fast forward ${this.seconds} seconds`);

    return el;
  }
}

// Skip Previous Button
export class SkipPreviousButton extends Button {
  constructor(player: Player, options: any = {}) {
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
}

// Skip Next Button
export class SkipNextButton extends Button {
  constructor(player: Player, options: any = {}) {
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
}

// Register all components
videojs.registerComponent('AudioRewindButton', AudioRewindButton);
videojs.registerComponent('AudioFastForwardButton', AudioFastForwardButton);
videojs.registerComponent('SkipPreviousButton', SkipPreviousButton);
videojs.registerComponent('SkipNextButton', SkipNextButton);
