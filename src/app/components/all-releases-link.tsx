/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { JSX } from 'react';

import Link from 'next/link';

import { Eye } from 'lucide-react';

import { artistReleasesHref } from '@/lib/utils/artist-releases-href';

interface AllReleasesLinkProps {
  /** The artist's slug: the releases listing is filtered by it. */
  slug: string;
}

/**
 * "View all releases", with an eye icon: every release the artist holds a
 * release credit on, as the releases listing filtered by their slug
 * (ADR-0006). Shown on the artist page beneath the latest release, or alone
 * when the artist's only releases are their bands'.
 */
export const AllReleasesLink = ({ slug }: AllReleasesLinkProps): JSX.Element => (
  <Link
    href={artistReleasesHref(slug)}
    className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:no-underline"
  >
    <Eye className="size-4" aria-hidden="true" />
    <span>View all releases</span>
  </Link>
);
