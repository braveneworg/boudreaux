/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ArtistLink, ArtistLinkGroup, ArtistLinks } from '@/lib/types/domain/artist';
import type { ArtistLinksFormValues } from '@/lib/validation/artist-links-schema';

import { isHttpUrl } from './is-http-url';
import { sanitizeBioText } from './sanitize-bio-html';

/** The three parts of `Artist.links` (ADR-0020). */
export type ArtistLinkSection = keyof ArtistLinks;

/** The contact-group headings the editor offers an artist that has none yet. */
export const CONTACT_GROUP_PREFILL: readonly string[] = ['Booking', 'Merch'];

/**
 * An email address as `mailto:` may carry: no whitespace, one `@`, a dotted
 * host, and none of `? # & %`, which would turn the href into a header
 * injection (`?bcc=`) or an encoded one.
 */
const EMAIL_ADDRESS = /^[^\s@?#&%]+@[^\s@?#&%]+\.[^\s@?#&%]+$/;

/** A phone number once its separators are gone: an optional `+` and 7–15 digits. */
const PHONE_DIGITS = /^\+?\d{7,15}$/;

/** The characters a human types between the digits of a phone number. */
const PHONE_SEPARATORS = /[\s().-]/g;

const MAILTO = /^mailto:/i;
const TEL = /^tel:/i;

const toMailtoHref = (address: string): string | null =>
  EMAIL_ADDRESS.test(address) ? `mailto:${address}` : null;

const toTelHref = (number: string): string | null => {
  const digits = number.replace(PHONE_SEPARATORS, '');
  return PHONE_DIGITS.test(digits) ? `tel:${digits}` : null;
};

/**
 * The href a contact link stores for what an admin typed: an http(s) URL as
 * is, an email address (bare or `mailto:`) as `mailto:`, a phone number
 * (bare or `tel:`) as `tel:` with its separators stripped. Anything else is
 * `null` (ADR-0020).
 */
export const toContactHref = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (isHttpUrl(trimmed)) return trimmed;
  if (MAILTO.test(trimmed)) return toMailtoHref(trimmed.replace(MAILTO, ''));
  if (TEL.test(trimmed)) return toTelHref(trimmed.replace(TEL, ''));
  if (trimmed.includes('@')) return toMailtoHref(trimmed);
  return toTelHref(trimmed);
};

/**
 * Whether a stored href may be rendered as a link in its section: http(s)
 * anywhere, and in the contact section a `mailto:` or `tel:` that is
 * exactly what {@link toContactHref} would store. A stored value is checked
 * again here because the rule, not the write, is what the page trusts.
 */
export const isRenderableArtistLinkHref = (href: string, section: ArtistLinkSection): boolean =>
  section === 'contact' ? toContactHref(href) === href : isHttpUrl(href);

const toLabel = (label: string): string | null => {
  const text = sanitizeBioText(label);
  return text === '' ? null : text;
};

const toStoredLink = ({
  label,
  url,
}: ArtistLinksFormValues['websiteLinks'][number]): ArtistLink => ({
  label: label || null,
  url,
});

/**
 * The form's three arrays in the stored shape, as typed: an empty label is
 * `null`, nothing else changes. {@link sanitizeArtistLinks} is what makes
 * the result storable.
 */
export const composeArtistLinks = ({
  websiteLinks,
  socialLinks,
  contactLinkGroups,
}: ArtistLinksFormValues): ArtistLinks => ({
  websites: websiteLinks.map(toStoredLink),
  social: socialLinks.map(toStoredLink),
  contact: contactLinkGroups.map(({ heading, links }) => ({
    heading,
    links: links.map(toStoredLink),
  })),
});

const sanitizeHttpLink = ({ label, url }: ArtistLink): ArtistLink => ({
  label: toLabel(label ?? ''),
  url: url.trim(),
});

const sanitizeContactLink = ({ label, url }: ArtistLink): ArtistLink => ({
  label: toLabel(label ?? ''),
  url: toContactHref(url) ?? url.trim(),
});

const sanitizeGroup = ({ heading, links }: ArtistLinkGroup): ArtistLinkGroup => ({
  heading: sanitizeBioText(heading),
  links: links.map(sanitizeContactLink),
});

/**
 * The one stored form of a links composite, applied by the service to
 * whatever it is handed (ADR-0020): labels and headings sanitised to plain
 * text (an empty label is `null`), contact hrefs in their stored form,
 * groups with no links dropped (the editor's prefilled headings are not
 * saved while empty), and the admin's order kept. `null` when every section
 * is empty, so such an artist stores no composite at all. Idempotent.
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

const toFormLink = ({ label, url }: ArtistLink): ArtistLinksFormValues['websiteLinks'][number] => ({
  label: label ?? '',
  url,
});

/**
 * The form's three arrays for a stored composite (or none): a `null` label
 * becomes an empty string, and an empty contact section is prefilled with
 * the {@link CONTACT_GROUP_PREFILL} headings — as default values, so they do
 * not dirty the form.
 */
export const toArtistLinksFormValues = (links: ArtistLinks | null): ArtistLinksFormValues => ({
  websiteLinks: (links?.websites ?? []).map(toFormLink),
  socialLinks: (links?.social ?? []).map(toFormLink),
  contactLinkGroups:
    links && links.contact.length > 0
      ? links.contact.map(({ heading, links: groupLinks }) => ({
          heading,
          links: groupLinks.map(toFormLink),
        }))
      : CONTACT_GROUP_PREFILL.map((heading) => ({ heading, links: [] })),
});
