/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ScrapedImage } from './jina.js';
import type { BioImage } from './types.js';

/** The registrable host of a scraped image's source page, for attribution. */
export const attributionHost = (sourceUrl: string): string => {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
};

/**
 * Maps a scraped page image onto the {@link BioImage} shape Commons images use.
 * Shared by the bio job (`handler.ts`) and the images-from-links task so both
 * paths ship identical shapes — and so the task never imports the orchestrator.
 */
export const toScrapedBioImage = (image: ScrapedImage): BioImage => ({
  url: image.url,
  thumbnailUrl: null,
  title: image.alt,
  attribution: attributionHost(image.sourceUrl),
  license: null,
  licenseUrl: null,
  sourceUrl: image.sourceUrl,
  width: null,
  height: null,
  isPrimary: false,
});
