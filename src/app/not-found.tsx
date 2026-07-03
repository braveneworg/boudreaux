/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { Button } from '@/app/components/ui/button';
import { ContentContainer } from '@/app/components/ui/content-container';
import { ImageHeading } from '@/app/components/ui/image-heading';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';

/**
 * Root 404 page — rendered inside the root layout for any unmatched route.
 * No breadcrumb (the route is unknown); a denim zine panel points back home.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel accent="denim">
          <ImageHeading
            src="/media/headings/NOT-FOUND.webp"
            alt="page not found"
            imageHeight={480}
            imageClassName="w-full"
            priority
          />
          <p className="mb-6 text-zinc-950">
            That page doesn&apos;t exist — it may have been torn off the wall.
          </p>
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
