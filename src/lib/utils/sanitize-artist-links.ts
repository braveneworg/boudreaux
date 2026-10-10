/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type {
  ArtistContactLink,
  ArtistLink,
  ArtistLinkGroup,
  ArtistLinks,
} from '@/lib/types/domain/artist';
import type { ArtistLinksFormValues } from '@/lib/validation/artist-links-schema';

import { composeArtistLinks, toContactHref } from './artist-links';
import { sanitizeBioText } from './sanitize-bio-html';

/** An optional label or description as stored: plain text, or `null` when none is left. */
const toPlainText = (value: string | null): string | null => {
  const text = sanitizeBioText(value ?? '');
  return text === '' ? null : text;
};

const sanitizeHttpLink = ({ label, url }: ArtistLink): ArtistLink => ({
  label: toPlainText(label),
  url: url.trim(),
});

const sanitizeContactLink = ({
  label,
  description,
  url,
}: ArtistContactLink): ArtistContactLink => ({
  label: toPlainText(label),
  description: toPlainText(description),
  url: toContactHref(url) ?? url.trim(),
});

const sanitizeGroup = ({ heading, links }: ArtistLinkGroup): ArtistLinkGroup => ({
  heading: sanitizeBioText(heading),
  links: links.map(sanitizeContactLink),
});

/**
 * The one stored form of a links composite, applied by the service to
 * whatever it is handed (ADR-0020): labels, contact descriptions and
 * headings sanitised to plain text (an empty label or description is
 * `null`), contact hrefs in their stored form, groups with no links dropped
 * (the editor's prefilled headings are not saved while empty), and the
 * admin's order kept. `null` when every section is empty, so such an artist
 * stores no composite at all. Idempotent.
 */
export const sanitizeArtistLinks = ({
  websites,
  social,
  contact,
}: ArtistLinks): ArtistLinks | null => {
  const links: ArtistLinks = {
    websites: websites.map(sanitizeHttpLink),
    social: social.map(sanitizeHttpLink),
    contact: contact.map(sanitizeGroup).filter((group) => group.links.length > 0),
  };
  const isEmpty = links.websites.length + links.social.length + links.contact.length === 0;
  return isEmpty ? null : links;
};

/** The composite to store for the form's three arrays: {@link composeArtistLinks}, sanitised. */
export const normalizeArtistLinks = (form: ArtistLinksFormValues): ArtistLinks | null =>
  sanitizeArtistLinks(composeArtistLinks(form));
