/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Display images — the ordered set of bio images shown for an Artist: all of
 * them on the public artist page, the first one on its index card.
 *
 * Chosen and ordered only by a human (`displayOrder`), with no cap; the bio
 * generation job may *suggest* images (`isPrimary`) but never chooses or
 * displaces a human's choice. While no human has chosen, the page shows up to
 * {@link FALLBACK_DISPLAY_IMAGE_CAP} suggested images that have alt text, else
 * the first pool images that have alt text — an image without alt is never
 * rendered as a display image unless a human chose it (ADR-0008 and its
 * addenda).
 *
 * Pure and client-safe: the public page, the listing service, the admin media
 * manager, and the cover-art picker all resolve through here so every surface
 * agrees on which images are the display images.
 */

/**
 * How many tiles the fallback tiers show while nothing is chosen. The chosen
 * tier has no cap (ADR-0008, second addendum).
 */
export const FALLBACK_DISPLAY_IMAGE_CAP = 3;

/** How many display images an index card shows: the first one. */
export const CARD_DISPLAY_IMAGE_COUNT = 1;

/** The fields display-image resolution reads off a bio image row. */
export interface DisplayImageCandidate {
  /** The bio generation job's suggestion; never a human's choice. */
  isPrimary: boolean;
  /**
   * Human-chosen 0-based position; `null` when not chosen. Absent on rows
   * serialised before the field existed, which also reads as not chosen.
   */
  displayOrder?: number | null;
  /**
   * Alt text; the fallback tiers take only rows that have it. Absent reads as
   * "no alt", so a projection that forgets the field fails closed.
   */
  alt?: string | null;
}

/** Which precedence tier supplied an artist's display images. */
export type DisplayImageTier = 'chosen' | 'suggested' | 'pool';

/** The resolved display images together with the tier they came from. */
export interface DisplayImageSet<T> {
  tier: DisplayImageTier;
  images: T[];
}

/** Whether a human has chosen this row (an absent position is "not chosen"). */
const isChosen = <T extends DisplayImageCandidate>(row: T): row is T & { displayOrder: number } =>
  typeof row.displayOrder === 'number';

/** Rows a human has chosen, ordered by their chosen position. */
const chosenInOrder = <T extends DisplayImageCandidate>(rows: readonly T[]): T[] =>
  rows.filter(isChosen).sort((a, b) => a.displayOrder - b.displayOrder);

/**
 * Whether a bio image already carries alt text, which every display image
 * needs because the public page renders it as content, not decoration. The
 * fallback tiers of {@link resolveDisplayImageSet} take only rows that have
 * it; the set-display-images service backfills a missing alt with the
 * artist's name and reads this to find the rows that need it.
 */
export const isDisplayEligible = (row: { alt?: string | null }): boolean =>
  Boolean(row.alt?.trim());

/**
 * Resolve an artist's display images from its bio image pool, reporting which
 * tier they came from. Rows are expected in pool (`sortOrder`) order, which is
 * the order every repository projection returns them in.
 *
 * Precedence: the human's chosen rows by position → the job's suggested rows
 * that have alt text → the first pool rows that have alt text. The chosen
 * tier is returned whole; each fallback tier is sliced to
 * {@link FALLBACK_DISPLAY_IMAGE_CAP}. A gap left by a deleted chosen row
 * keeps the remaining relative order. Chosen rows are not re-checked for alt:
 * the set-display-images service backfills a missing one with the artist's
 * name before it saves the choice.
 *
 * @param rows - The artist's bio images in pool order.
 * @returns The tier and its display images; the tier is `'pool'` when
 *   nothing is eligible. Never mutates `rows`.
 */
export const resolveDisplayImageSet = <T extends DisplayImageCandidate>(
  rows: readonly T[]
): DisplayImageSet<T> => {
  const chosen = chosenInOrder(rows);
  if (chosen.length > 0) return { tier: 'chosen', images: chosen };

  const eligible = rows.filter(isDisplayEligible);
  const suggested = eligible.filter((row) => row.isPrimary);
  if (suggested.length > 0) {
    return { tier: 'suggested', images: suggested.slice(0, FALLBACK_DISPLAY_IMAGE_CAP) };
  }
  return { tier: 'pool', images: eligible.slice(0, FALLBACK_DISPLAY_IMAGE_CAP) };
};

/** How many bio images a human has chosen — the publish gate's count (ADR-0019). */
export const countChosenDisplayImages = <T extends DisplayImageCandidate>(
  rows: readonly T[]
): number => rows.filter(isChosen).length;

/**
 * Resolve an artist's display images — {@link resolveDisplayImageSet}
 * without the tier, for surfaces that only render them.
 *
 * @param rows - The artist's bio images in pool order.
 * @returns The display images; never mutates `rows`.
 */
export const resolveDisplayImages = <T extends DisplayImageCandidate>(rows: readonly T[]): T[] =>
  resolveDisplayImageSet(rows).images;

/**
 * The ids of the rows a human has chosen, in position order — the value the
 * set-display-images action takes, so a reorder or removal is expressed as
 * "the new ordered id list".
 */
export const chosenDisplayImageIds = <T extends DisplayImageCandidate & { id: string }>(
  rows: readonly T[]
): string[] => chosenInOrder(rows).map(({ id }) => id);

/**
 * Order a bio image pool for a picker: the chosen rows by position, then the
 * suggested rows, then everything else — each tier in pool order, each row
 * exactly once.
 */
export const orderBioImagesForPicker = <T extends DisplayImageCandidate>(
  rows: readonly T[]
): T[] => {
  const chosen = chosenInOrder(rows);
  const suggested = rows.filter((row) => !isChosen(row) && row.isPrimary);
  const rest = rows.filter((row) => !isChosen(row) && !row.isPrimary);
  return [...chosen, ...suggested, ...rest];
};

/**
 * The rule for a fresh media-manager upload: it joins the display images,
 * appended last, unless it is already chosen. Decided against the set as it
 * is when the upload LANDS — the media manager once decided against the set
 * as it was when the upload started, and a choice made during the
 * seconds-long upload was then overwritten.
 *
 * @param chosenIds - The chosen ids, in order, right now.
 * @param uploadedId - The row the upload just created.
 * @returns The new ordered id list to write, or `null` to leave the set alone.
 */
export const decideUploadJoin = (
  chosenIds: readonly string[],
  uploadedId: string
): string[] | null => (chosenIds.includes(uploadedId) ? null : [...chosenIds, uploadedId]);
