/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { logEvent } from './lib/log.js';
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
 * Reads the Commons `LicenseUrl`, keeping only real `http` URLs — the field is
 * occasionally junk (e.g. free-text), so non-`http` values collapse to `null`.
 */
const readLicenseUrl = (meta: NonNullable<CommonsImageInfo['extmetadata']>): string | null => {
  const rawLicenseUrl = meta.LicenseUrl?.value ? stripHtml(meta.LicenseUrl.value) : '';
  return rawLicenseUrl.startsWith('http') ? rawLicenseUrl : null;
};

/**
 * Derives the attribution, license, and machine-readable license URL from the
 * Commons `extmetadata`. Falls back to a generic attribution when the
 * artist/credit fields are absent.
 */
const readAttribution = (
  meta: NonNullable<CommonsImageInfo['extmetadata']>
): { attribution: string; license: string | null; licenseUrl: string | null } => {
  const artist = meta.Artist?.value ? stripHtml(meta.Artist.value) : 'Wikimedia Commons';
  const credit = meta.Credit?.value ? stripHtml(meta.Credit.value) : undefined;
  const license = meta.LicenseShortName?.value ? stripHtml(meta.LicenseShortName.value) : null;
  const licenseUrl = readLicenseUrl(meta);
  return { attribution: credit ? `${artist} (${credit})` : artist, license, licenseUrl };
};

/**
 * True when a Commons file is flagged with personality (image) rights, which we
 * must not re-host without the depicted person's consent. Trademark/insignia
 * restrictions stay usable — only personality rights trigger the skip.
 */
const isRestrictedForPersonalityRights = (
  meta: NonNullable<CommonsImageInfo['extmetadata']>
): boolean => {
  const restrictions = meta.Restrictions?.value ? stripHtml(meta.Restrictions.value) : '';
  return restrictions.toLowerCase().includes('personality');
};

/** Maps a single Commons imageinfo entry to the displayable {@link BioImage}. */
const toBioImage = (info: CommonsImageInfo, title: string): BioImage => {
  const { attribution, license, licenseUrl } = readAttribution(info.extmetadata ?? {});
  return {
    url: info.url ?? '',
    thumbnailUrl: info.thumburl ?? null,
    title: stripHtml(title.replace(/^File:/, '')),
    attribution,
    license,
    licenseUrl,
    sourceUrl: info.descriptionurl ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
    isPrimary: false,
  };
};

/**
 * Maps a usable imageinfo entry to a {@link BioImage}, or `null` (with a warn)
 * when the file is personality-rights restricted and must not be re-hosted.
 */
const toUsableBioImage = (info: CommonsImageInfo, title: string): BioImage | null => {
  if (isRestrictedForPersonalityRights(info.extmetadata ?? {})) {
    logEvent('warn', 'commons_restricted_skipped', { title });
    return null;
  }
  return toBioImage(info, title);
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

  return toUsableBioImage(info, title);
};

type CommonsPage = NonNullable<NonNullable<CommonsResponse['query']>['pages']>[string];

/** Maps one category-member page to a photo BioImage, or null if unusable. */
const categoryPageToImage = (page: CommonsPage): BioImage | null => {
  const info = page.imageinfo?.[0];
  if (!info?.url || !page.title) return null;
  const image = toUsableBioImage(info, page.title);
  return image ? { ...image, kind: 'photo' as const } : null;
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
    return Object.values(body.query?.pages ?? {})
      .map(categoryPageToImage)
      .filter((img): img is BioImage => img !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
};
