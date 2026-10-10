/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useId } from 'react';
import type { JSX } from 'react';

import { ArtistLinkIcon } from '@/app/components/artist-link-icon';
import type { ArtistContactLink, ArtistLink, ArtistLinkGroup } from '@/lib/types/domain/artist';
import { cn } from '@/lib/utils';
import { isRenderableArtistLinkHref, type ArtistLinkSection } from '@/lib/utils/artist-links';

const HEADING_CLASS = 'border-b-2 border-black pb-0.5 text-base font-semibold';

/**
 * A URL as a reader names it: the host without its `www.`, and, when
 * `withPath`, everything after the host except a trailing slash on the path.
 */
const addressOf = (url: string, withPath: boolean): string | null => {
  try {
    const { hostname, pathname, search, hash } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    if (host === '') return null;
    return withPath ? `${host}${pathname.replace(/\/$/, '')}${search}${hash}` : host;
  } catch {
    return null;
  }
};

/**
 * The text a link shows: the address of a `mailto:`, the number of a `tel:`,
 * and for an http(s) URL what follows the `www.` in Websites and Social
 * Media, or only the host in Contact & Misc. The raw value when none of
 * those parse.
 */
export const linkText = (url: string, section: ArtistLinkSection): string => {
  if (/^mailto:/i.test(url)) return url.slice('mailto:'.length);
  if (/^tel:/i.test(url)) return url.slice('tel:'.length);
  return addressOf(url, section !== 'contact') ?? url;
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

interface LinkValueProps {
  href: string;
  text: string;
  renderable: boolean;
  className: string;
}

/**
 * The link of a row: an http(s) one opens in a new tab with the usual
 * hardening, `mailto:`/`tel:` open in place. A stored href that fails the
 * rule at render (ADR-0020) is shown as text and never as a link.
 */
const LinkValue = ({ href, text, renderable, className }: LinkValueProps): JSX.Element =>
  renderable ? (
    <a
      href={href}
      {...(isHttp(href) ? { target: '_blank', rel: 'nofollow noopener noreferrer' } : {})}
      className={cn('truncate underline underline-offset-4 hover:no-underline', className)}
    >
      {text}
    </a>
  ) : (
    <span className={cn('truncate text-zinc-700', className)}>{text}</span>
  );

/** The flat sections: every {@link ArtistLinkSection} but Contact & Misc. */
type FlatLinkSection = Exclude<ArtistLinkSection, 'contact'>;

/** A link with its section: only a Contact & Misc link has a description. */
type LinkItemProps =
  { link: ArtistLink; section: FlatLinkSection } | { link: ArtistContactLink; section: 'contact' };

/**
 * One row: the icon the href resolves to, the label (when it is not the link
 * text itself), and the link. Websites and Social Media are a ledger line,
 * with a dotted leader between the label and the link. Contact & Misc
 * stacks instead: a semibold label, the link's description (when it has
 * one) in normal weight under it, and the link under both, all on the
 * label's left edge, so an email address has the whole column. The
 * description is plain text and wraps. The link itself is a
 * {@link LinkValue}.
 */
export const LinkItem = ({ link, section }: LinkItemProps): JSX.Element => {
  const text = linkText(link.url, section);
  const stacked = section === 'contact';
  const description = stacked ? link.description : null;
  const valueClass = stacked ? 'col-start-2 justify-self-start' : 'max-w-[60%]';
  return (
    <li
      className={cn(
        'text-sm',
        stacked
          ? 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5'
          : 'flex items-baseline gap-2'
      )}
    >
      <ArtistLinkIcon
        href={link.url}
        section={section}
        size={14}
        className={cn('text-zinc-600', !stacked && 'self-center')}
      />
      {link.label && link.label !== text ? (
        <span className={cn('text-zinc-700', stacked && 'font-semibold')}>{link.label}</span>
      ) : null}
      {description ? (
        <p className="col-start-2 text-sm font-normal break-words text-zinc-700">{description}</p>
      ) : null}
      {stacked ? null : (
        <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-zinc-500" />
      )}
      <LinkValue
        href={link.url}
        text={text}
        renderable={isRenderableArtistLinkHref(link.url, section)}
        className={valueClass}
      />
    </li>
  );
};

interface LinkSectionProps {
  heading: string;
  section: FlatLinkSection;
  links: ArtistLink[];
}

/** A flat link section (Websites, Social Media): a heading over its rows; nothing when empty. */
export const LinkSection = ({ heading, section, links }: LinkSectionProps): JSX.Element | null => {
  const headingId = useId();
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className={HEADING_CLASS}>
        {heading}
      </h2>
      <ul className="space-y-3">
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
  <div className="space-y-2">
    <h3 className="text-sm font-semibold text-zinc-800">{group.heading}</h3>
    <ul className="space-y-3">
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
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className={HEADING_CLASS}>
        Contact &amp; Misc
      </h2>
      {/* The groups stand further from each other than the first does from the heading. */}
      <div className="space-y-6">
        {keyedBy(filled, (group) => group.heading).map(({ key, item }) => (
          <LinkGroup key={key} group={item} />
        ))}
      </div>
    </section>
  );
};
