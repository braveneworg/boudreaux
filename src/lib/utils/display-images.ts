/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Display images — the ordered set of up to {@link DISPLAY_IMAGE_CAP} bio
 * images shown for an Artist on the public artist page and index cards.
 *
 * Chosen and ordered only by a human (`displayOrder`); the bio generation job
 * may *suggest* images (`isPrimary`) but never chooses or displaces a human's
 * choice. While no human has chosen, the page shows the suggested images.
 *
 * Pure and client-safe: the public page, the listing service, the admin media
 * manager, and the cover-art picker all resolve through here so every surface
 * agrees on which images are the display images.
 */

/** Number of display-image slots the public artist page renders. */
export const DISPLAY_IMAGE_CAP = 3;

/** The fields display-image resolution reads off a bio image row. */
export interface DisplayImageCandidate {
  /** The bio generation job's suggestion; never a human's choice. */
  isPrimary: boolean;
  /** Human-chosen 0-based position; `null` when not chosen. */
  displayOrder: number | null;
}

/** Rows a human has chosen, ordered by their chosen position. */
const chosenInOrder = <T extends DisplayImageCandidate>(rows: readonly T[]): T[] =>
  rows
    .filter((row): row is T & { displayOrder: number } => row.displayOrder !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);

/**
 * Resolve an artist's display images from its bio image pool. Rows are
 * expected in pool (`sortOrder`) order, which is the order every repository
 * projection returns them in.
 *
 * Precedence: the human's chosen rows by position → the job's suggested rows
 * → the first pool rows. Each tier is sliced to {@link DISPLAY_IMAGE_CAP};
 * a gap left by a deleted chosen row keeps the remaining relative order.
 *
 * @param rows - The artist's bio images in pool order.
 * @returns The display images, never more than the cap; never mutates `rows`.
 */
export const resolveDisplayImages = <T extends DisplayImageCandidate>(rows: readonly T[]): T[] => {
  const chosen = chosenInOrder(rows);
  if (chosen.length > 0) return chosen.slice(0, DISPLAY_IMAGE_CAP);

  const suggested = rows.filter((row) => row.isPrimary);
  const tier = suggested.length > 0 ? suggested : rows;
  return tier.slice(0, DISPLAY_IMAGE_CAP);
};

/**
 * The ids of the rows a human has chosen, in position order — the value the
 * set-display-images action takes, so a reorder or removal is expressed as
 * "the new ordered id list".
 */
export const chosenDisplayImageIds = <T extends DisplayImageCandidate & { id: string }>(
  rows: readonly T[]
): string[] => chosenInOrder(rows).map(({ id }) => id);

/**
 * Whether a bio image may be chosen as a display image: it needs alt text,
 * because the public page renders it as content, not decoration. The service
 * enforces this; the UI uses it to disable the "use" affordance with a hint.
 */
export const isDisplayEligible = (row: { alt?: string | null }): boolean =>
  Boolean(row.alt?.trim());

/**
 * Order a bio image pool for a picker: the chosen rows by position, then the
 * suggested rows, then everything else — each tier in pool order, each row
 * exactly once.
 */
export const orderBioImagesForPicker = <T extends DisplayImageCandidate>(
  rows: readonly T[]
): T[] => {
  const chosen = chosenInOrder(rows);
  const suggested = rows.filter((row) => row.displayOrder === null && row.isPrimary);
  const rest = rows.filter((row) => row.displayOrder === null && !row.isPrimary);
  return [...chosen, ...suggested, ...rest];
};
