/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ReleasesSkeleton } from '@/app/components/releases-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';

/**
 * Suspense fallback for `/releases`: the page's cyan zine panel around the
 * skeleton the listing itself shows while its first page loads — the search
 * bar, the wordmark and the 1/2/4-column cover grid — so a navigation swaps
 * skeleton → page in place.
 */
export default function ReleasesLoading() {
  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel accent="cyan">
          <ReleasesSkeleton />
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
