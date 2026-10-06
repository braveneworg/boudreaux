/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Page } from '@playwright/test';

/**
 * Make media on the page refuse to play without a user gesture, as a strict
 * autoplay policy does: `play()` rejects unless the page holds transient
 * user activation. This reproduced #715, where one click downloaded the
 * video but a profile with autoplay blocked never started it.
 */
export const blockAutoplayWithoutGesture = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function playOnlyWithGesture(this: HTMLMediaElement) {
      if (!navigator.userActivation.isActive) {
        return Promise.reject(new DOMException('play() needs a user gesture', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
};

/** Whether any media element on the page is playing. */
export const isAnyMediaPlaying = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLMediaElement>('audio, video')].some(
      (media) => !media.paused && !media.ended
    )
  );
