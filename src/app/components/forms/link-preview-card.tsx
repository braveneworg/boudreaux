/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { Skeleton } from '@/app/components/ui/skeleton';
import { useLinkPreviewQuery } from '@/app/hooks/use-link-preview-query';
import type { LinkPreview } from '@/lib/validation/link-preview-schema';

interface LinkPreviewCardProps {
  url: string;
  enabled: boolean;
}

/** Best-effort host label for the fallback state; never throws on a bad URL. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Renders a resolved unfurl: the hero thumbnail (a self-generated `data:` URI —
 * `next/image` is unnecessary for a bounded inline image), favicon, site name,
 * bold title and a line-clamped description. Extracted from `LinkPreviewCard`
 * so each render path stays within the complexity budget.
 */
const ResolvedPreview = ({ url, data }: { url: string; data: LinkPreview }): JSX.Element => {
  const { title, description, siteName, imageDataUri, faviconDataUri } = data;

  return (
    <article className="space-y-2">
      {imageDataUri && (
        <img
          src={imageDataUri}
          alt={title ?? siteName ?? hostOf(url)}
          width={320}
          height={168}
          className="h-auto w-full border-2 border-black object-cover"
        />
      )}
      <div className="flex items-center gap-1.5">
        {faviconDataUri && (
          <img src={faviconDataUri} alt="" width={16} height={16} className="size-4 shrink-0" />
        )}
        <span className="text-muted-foreground truncate text-xs">{siteName ?? hostOf(url)}</span>
      </div>
      {title && <h4 className="text-sm leading-snug font-bold">{title}</h4>}
      {description && <p className="text-muted-foreground line-clamp-3 text-xs">{description}</p>}
    </article>
  );
};

/**
 * Body of a link's unfurl preview, shared by the desktop HoverCard and the
 * mobile Popover in `BioLinkPalette`. Lazily fetches via `useLinkPreviewQuery`
 * (gated by `enabled` = the card's open state): a pending query shows a
 * skeleton, a resolved preview shows the hero thumbnail (a self-generated
 * `data:` URI — `next/image` is unnecessary for a bounded inline image),
 * favicon, site name, bold title and a line-clamped description, and any
 * failure or unresolved response degrades to the bare host.
 *
 * @param url - The external URL being previewed.
 * @param enabled - Whether the card is open; drives the lazy query.
 * @returns The preview card body.
 */
export const LinkPreviewCard = ({ url, enabled }: LinkPreviewCardProps): JSX.Element => {
  const { data, isPending, isError } = useLinkPreviewQuery(url, { enabled });

  if (enabled && isPending) {
    return (
      <div role="status" aria-label="Loading link preview" className="space-y-2">
        <Skeleton className="my-0 h-28 w-full" />
        <Skeleton className="my-0 h-3 w-1/3" />
        <Skeleton className="my-0 h-4 w-3/4" />
      </div>
    );
  }

  if (isError || !data || !data.resolved) {
    return (
      <p className="text-muted-foreground text-xs">
        No preview available — <span className="break-all">{hostOf(url)}</span>
      </p>
    );
  }

  return <ResolvedPreview url={url} data={data} />;
};
