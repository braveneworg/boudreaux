/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { Button } from '@/app/components/ui/button';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Merch',
  description: 'The merch table is being set up. Shirts, tapes, and prints are coming soon.',
};

const breadcrumbItems = [{ anchorText: 'Merch', url: '/merch', isActive: true }];

export default function MerchPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel chat accent="mustard" breadcrumbs={breadcrumbItems}>
          <ZineHeading level={1}>Merch</ZineHeading>
          <p className="mb-6 text-zinc-950">
            The merch table is being set up. Shirts, tapes, and prints are coming soon.
          </p>
          <Button asChild>
            <Link href="/releases">Browse Releases</Link>
          </Button>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
