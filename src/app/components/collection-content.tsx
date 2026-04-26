/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { useCollectionQuery } from '@/app/hooks/use-collection-query';

import { CollectionList } from './collection-list';
import { BreadcrumbMenu } from './ui/breadcrumb-menu';

/**
 * Client content wrapper for the collection page.
 * Uses TanStack Query to fetch user's collection (hydrated from SSR prefetch).
 */
export const CollectionContent = () => {
  const { isPending, error, data } = useCollectionQuery();

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-950-foreground">
            Failed to load collection
          </h3>
          <p className="mt-2 text-sm text-zinc-950-foreground">Please try again later.</p>
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
      <BreadcrumbMenu
        items={[
          {
            anchorText: 'My Collection',
            url: '/collection',
            isActive: true,
          },
        ]}
      />
      <div className="px-4 pb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">My Collection</h1>
        {purchases.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-lg">No purchases yet.</p>
            <p className="text-zinc-400 text-sm mt-2">
              Browse{' '}
              <Link href="/releases" className="underline text-zinc-600">
                releases
              </Link>{' '}
              to find music you love.
            </p>
          </div>
        ) : (
          <CollectionList purchases={purchases} isAdmin={isAdmin} />
        )}
      </div>
    </>
  );
};
