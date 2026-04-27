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
        <Loader2 className="text-zinc-950-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed p-8">
        <div className="text-center">
          <h3 className="text-zinc-950-foreground text-lg font-semibold">
            Failed to load collection
          </h3>
          <p className="text-zinc-950-foreground mt-2 text-sm">Please try again later.</p>
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
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900">My Collection</h1>
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
      </div>
    </>
  );
};
