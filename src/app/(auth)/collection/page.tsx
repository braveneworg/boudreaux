/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CollectionList } from '@/app/components/collection-list';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

import { auth } from '../../../../auth';

const CollectionPage = async () => {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/signin');
  }

  const purchases = await PurchaseRepository.findAllByUser(session.user.id);
  const isAdmin = session.user.role === 'admin';

  return (
    <PageContainer>
      <ContentContainer>
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
      </ContentContainer>
    </PageContainer>
  );
};

export default CollectionPage;
