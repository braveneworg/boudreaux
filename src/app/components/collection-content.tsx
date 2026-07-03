/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { useCollectionQuery } from '@/app/hooks/use-collection-query';

import { CollectionList } from './collection-list';
import { ImageHeading } from './ui/image-heading';
import { ZinePanel } from './ui/zine-panel';

/**
 * Client content wrapper for the collection page.
 * Uses TanStack Query to fetch user's collection (hydrated from SSR prefetch).
 */
export const CollectionContent = () => {
  const { isPending, error, data } = useCollectionQuery();

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center border-2 border-dashed p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-950">Failed to load collection</h3>
          <p className="mt-2 text-sm text-zinc-950">Please try again later.</p>
        </div>
      </div>
    );
  }

  const purchases = (data?.purchases ?? []).map(({ purchasedAt, ...rest }) => ({
    ...rest,
    purchasedAt: new Date(purchasedAt),
  }));
  const isAdmin = data?.isAdmin ?? false;

  return (
    <>
      <ZinePanel
        chat
        accent="green"
        breadcrumbs={[
          {
            anchorText: 'My Collection',
            url: '/collection',
            isActive: true,
          },
        ]}
      >
        <ImageHeading
          src="/media/headings/MY-COLLECTION.webp"
          alt="my collection"
          imageHeight={480}
          priority
        />
        {purchases.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-lg text-zinc-500">No purchases yet.</p>
            <p className="mt-2 text-sm text-zinc-400">
              Browse{' '}
              <Link href="/releases" className="text-zinc-600 underline">
                releases
              </Link>{' '}
              to find music you love.
            </p>
          </div>
        ) : (
          <CollectionList purchases={purchases} isAdmin={isAdmin} />
        )}
      </ZinePanel>
    </>
  );
};
