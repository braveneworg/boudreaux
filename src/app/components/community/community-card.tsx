/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';
import Link from 'next/link';

import { GravatarAvatar } from '@/app/components/gravatar-avatar';
import { submissionPath, userSubmissionsPath } from '@/lib/community/community-paths';
import { NAMELESS_OWNER, submissionCategoryShortLabel } from '@/lib/constants/submissions';
import type { SubmissionCard } from '@/lib/types/domain/submission';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

/**
 * How wide a card's picture is drawn: two cards across on a phone, three from
 * `md`, four from `lg`, inside the page's panel.
 */
const CARD_PICTURE_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw';

/** The avatar's edge in pixels, asked of Gravatar at twice its drawn size. */
const AVATAR_PIXELS = 80;

export interface CommunityCardProps {
  card: SubmissionCard;
}

/**
 * One listed submission as a card (CONTEXT.md), in a submission row and in
 * the community page's full list: its card picture with the owner's avatar
 * laid over the bottom-left corner, then its title, then the owner's
 * username.
 *
 * The title is the card's one link to the submission, stretched over the
 * picture, so a keyboard or screen reader meets it once. The username is a
 * second link, to that user's listed submissions; an owner with no username
 * reads "A community member" and links nowhere. The picture and the avatar
 * are decoration beside those two names.
 */
export const CommunityCard = ({ card }: CommunityCardProps) => {
  const { id, category, cardPictureUrl, owner } = card;
  const title = card.title === '' ? 'Untitled' : card.title;

  return (
    <article className="group relative flex min-w-0 flex-col gap-4">
      <div className="relative">
        <div className="shadow-zine-sm relative aspect-square overflow-hidden border-2 border-black bg-(--card-accent-soft) transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transition-none">
          {cardPictureUrl === null ? (
            <span className="font-fake-four-cutout flex size-full items-center justify-center p-3 text-center text-2xl leading-tight text-black uppercase">
              {submissionCategoryShortLabel(category)}
            </span>
          ) : (
            <Image
              {...resolveCdnImageSource(cardPictureUrl)}
              alt=""
              fill
              sizes={CARD_PICTURE_SIZES}
              className="object-cover"
            />
          )}
        </div>
        <GravatarAvatar
          hash={owner.gravatarHash}
          size={AVATAR_PIXELS}
          defaultStyle="identicon"
          alt=""
          className="shadow-zine-ink absolute -bottom-3 left-2 size-10 border-2 border-black bg-white"
        />
      </div>
      <div className="min-w-0 text-sm leading-snug text-zinc-950">
        <p className="line-clamp-2 font-semibold">
          <Link
            href={submissionPath(id)}
            // Not prefetched: every prefetch of a submission's page is a
            // lookup in the proxy, and a page shows a dozen cards at a time.
            prefetch={false}
            // Stretched over the whole card: the picture is part of this link.
            className="underline underline-offset-4 after:absolute after:inset-0 hover:no-underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-black focus-visible:after:ring-offset-2"
          >
            {title}
          </Link>
        </p>
        <p className="truncate text-zinc-700">
          {owner.username === null ? (
            NAMELESS_OWNER
          ) : (
            <Link
              href={userSubmissionsPath(owner.username)}
              // Above the stretched title link, so it takes its own clicks.
              className="relative z-10 underline underline-offset-4 hover:no-underline"
            >
              {owner.username}
            </Link>
          )}
        </p>
      </div>
    </article>
  );
};
