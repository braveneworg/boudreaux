/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { USER_AGENT } from './types.js';

import type { BioImage } from './types.js';

type FetchFn = typeof fetch;

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH = 400;

/** Minimal shape of the Commons imageinfo response. */
interface CommonsResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          url?: string;
          thumburl?: string;
          descriptionurl?: string;
          width?: number;
          height?: number;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }
    >;
  };
}

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, '').trim();

type CommonsImageInfo = NonNullable<
  NonNullable<NonNullable<CommonsResponse['query']>['pages']>[string]['imageinfo']
>[number];

/**
 * Derives the attribution + license from the Commons `extmetadata`. Falls back
 * to a generic attribution when the artist/credit fields are absent.
 */
const readAttribution = (
  meta: NonNullable<CommonsImageInfo['extmetadata']>
): { attribution: string; license: string | null } => {
  const artist = meta.Artist?.value ? stripHtml(meta.Artist.value) : 'Wikimedia Commons';
  const credit = meta.Credit?.value ? stripHtml(meta.Credit.value) : undefined;
  const license = meta.LicenseShortName?.value ? stripHtml(meta.LicenseShortName.value) : null;
  return { attribution: credit ? `${artist} (${credit})` : artist, license };
};

/** Maps a single Commons imageinfo entry to the displayable {@link BioImage}. */
const toBioImage = (info: CommonsImageInfo, title: string): BioImage => {
  const { attribution, license } = readAttribution(info.extmetadata ?? {});
  return {
    url: info.url ?? '',
    thumbnailUrl: info.thumburl ?? null,
    title: stripHtml(title.replace(/^File:/, '')),
    attribution,
    license,
    sourceUrl: info.descriptionurl ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
    isPrimary: false,
  };
};

/**
 * Resolves a Wikimedia Commons file name to a displayable image with the
 * attribution and license text required to hotlink it compliantly.
 *
 * @param fileName - The Commons file name, e.g. `Radiohead 2008.jpg` (with or
 * without a `File:` prefix).
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The image metadata, or `null` when the file has no usable info.
 */
export const getCommonsImage = async (
  fileName: string,
  fetchFn: FetchFn = fetch
): Promise<BioImage | null> => {
  const title = fileName.startsWith('File:') ? fileName : `File:${fileName}`;
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(THUMB_WIDTH),
    format: 'json',
    formatversion: '1',
  });

  const response = await fetchFn(`${COMMONS_API}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Wikimedia request failed (${response.status}) for ${title}`);
  }

  const body = (await response.json()) as CommonsResponse;
  const pages = body.query?.pages ?? {};
  const info = Object.values(pages)[0]?.imageinfo?.[0];
  if (!info?.url) {
    return null;
  }

  return toBioImage(info, title);
};

/**
 * Lists file members of a Commons category (P373) and resolves each to a
 * displayable image. Categories often hold dozens of real photos of the
 * artist beyond the single P18 portrait. Best-effort: failures return [].
 */
export const getCommonsCategoryImages = async (
  category: string,
  limit: number,
  fetchFn: FetchFn = fetch
): Promise<BioImage[]> => {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: `Category:${category}`,
    gcmtype: 'file',
    gcmlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(THUMB_WIDTH),
    format: 'json',
    formatversion: '1',
  });

  try {
    const response = await fetchFn(`${COMMONS_API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as CommonsResponse;
    const images: BioImage[] = [];
    for (const page of Object.values(body.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (!info?.url || !page.title) continue;
      const base = toBioImage(info, page.title);
      images.push({
        url: base.url,
        thumbnailUrl: base.thumbnailUrl,
        title: base.title,
        attribution: base.attribution,
        license: base.license,
        sourceUrl: base.sourceUrl,
        width: base.width,
        height: base.height,
        isPrimary: base.isPrimary,
        kind: 'photo',
      });
    }
    return images.slice(0, limit);
  } catch {
    return [];
  }
};
