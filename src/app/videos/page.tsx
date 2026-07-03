/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Videos',
  description:
    "Music videos and live session footage are on the way — we're digitizing the archive now.",
};

const breadcrumbItems = [{ anchorText: 'Videos', url: '/videos', isActive: true }];

export default function VideosPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={breadcrumbItems} />
        <ZinePanel accent="kraft">
          <ZineHeading level={1}>Videos</ZineHeading>
          <p className="mb-6 text-zinc-950">
            Music videos and live session footage are on the way &mdash; we&apos;re digitizing the
            archive now.
          </p>
          <Button asChild>
            <Link href="/releases">Browse Releases</Link>
          </Button>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
