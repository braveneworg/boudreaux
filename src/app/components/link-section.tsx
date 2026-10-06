/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useId } from 'react';
import type { JSX } from 'react';

import { ArtistLinkIcon } from '@/app/components/artist-link-icon';
import type { ArtistLink, ArtistLinkGroup } from '@/lib/types/domain/artist';
import { isRenderableArtistLinkHref, type ArtistLinkSection } from '@/lib/utils/artist-links';

const HEADING_CLASS = 'border-b-2 border-black pb-0.5 text-base font-semibold';

const hostOf = (url: string): string | null => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === '' ? null : host;
  } catch {
    return null;
  }
};

/**
 * The text a link shows: the address of a `mailto:`, the number of a `tel:`,
 * the host of an http(s) URL, or the raw value when none of those parse.
 */
export const linkText = (url: string): string => {
  if (/^mailto:/i.test(url)) return url.slice('mailto:'.length);
  if (/^tel:/i.test(url)) return url.slice('tel:'.length);
  return hostOf(url) ?? url;
};

const isHttp = (url: string): boolean => /^https?:/i.test(url);

/**
 * React keys for rows that may repeat a value (two labels for one URL, two
 * groups with one heading): the value plus how often it has appeared so far,
 * so duplicates never collide and a row keeps its key when others move.
 */
const keyedBy = <T,>(items: T[], valueOf: (item: T) => string): Array<{ key: string; item: T }> => {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const value = valueOf(item);
    const occurrence = seen.get(value) ?? 0;
    seen.set(value, occurrence + 1);
    return { key: `${value}#${occurrence}`, item };
  });
};

interface LinkItemProps {
  link: ArtistLink;
  section: ArtistLinkSection;
}

/**
 * One ledger row: the icon the href resolves to, the label (when it is not
 * the link text itself), a dotted leader, and the link. An http(s) link
 * opens in a new tab with the usual hardening; `mailto:`/`tel:` open in
 * place. A stored href that fails the rule at render (ADR-0020) is shown as
 * text and never as a link.
 */
export const LinkItem = ({ link, section }: LinkItemProps): JSX.Element => {
  const text = linkText(link.url);
  const renderable = isRenderableArtistLinkHref(link.url, section);
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <ArtistLinkIcon
        href={link.url}
        section={section}
        size={14}
        className="self-center text-zinc-600"
      />
      {link.label && link.label !== text ? (
        <span className="text-zinc-700">{link.label}</span>
      ) : null}
      <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-zinc-500" />
      {renderable ? (
        <a
          href={link.url}
          {...(isHttp(link.url) ? { target: '_blank', rel: 'nofollow noopener noreferrer' } : {})}
          className="max-w-[60%] truncate underline underline-offset-4 hover:no-underline"
        >
          {text}
        </a>
      ) : (
        <span className="max-w-[60%] truncate text-zinc-700">{text}</span>
      )}
    </li>
  );
};

interface LinkSectionProps {
  heading: string;
  section: ArtistLinkSection;
  links: ArtistLink[];
}

/** A flat link section (Websites, Social Media): a heading over its rows; nothing when empty. */
export const LinkSection = ({ heading, section, links }: LinkSectionProps): JSX.Element | null => {
  const headingId = useId();
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-1.5">
      <h2 id={headingId} className={HEADING_CLASS}>
        {heading}
      </h2>
      <ul className="space-y-1">
        {keyedBy(links, (link) => link.url).map(({ key, item }) => (
          <LinkItem key={key} link={item} section={section} />
        ))}
      </ul>
    </section>
  );
};

interface LinkGroupProps {
  group: ArtistLinkGroup;
}

/** One Contact & Misc group: its heading over its rows. */
export const LinkGroup = ({ group }: LinkGroupProps): JSX.Element => (
  <div className="space-y-1">
    <h3 className="text-sm font-semibold text-zinc-800">{group.heading}</h3>
    <ul className="space-y-1">
      {keyedBy(group.links, (link) => link.url).map(({ key, item }) => (
        <LinkItem key={key} link={item} section="contact" />
      ))}
    </ul>
  </div>
);

interface ContactLinkSectionProps {
  groups: ArtistLinkGroup[];
}

/** The Contact & Misc section: every group that has a link; nothing when none has. */
export const ContactLinkSection = ({ groups }: ContactLinkSectionProps): JSX.Element | null => {
  const headingId = useId();
  const filled = groups.filter((group) => group.links.length > 0);
  if (filled.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className={HEADING_CLASS}>
        Contact &amp; Misc
      </h2>
      {keyedBy(filled, (group) => group.heading).map(({ key, item }) => (
        <LinkGroup key={key} group={item} />
      ))}
    </section>
  );
};
