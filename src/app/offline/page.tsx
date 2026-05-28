/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WifiOff } from 'lucide-react';

import { PageContainer } from '../components/ui/page-container';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline — Fake Four Inc.',
};

// Served by the service worker as the navigation fallback when the network is
// unavailable and the requested route has not been cached.
export default function OfflinePage() {
  return (
    <PageContainer className="items-center justify-center gap-4 px-6 py-24 text-center">
      <WifiOff aria-hidden="true" className="text-muted-foreground size-12" />
      <h1>You&apos;re offline</h1>
      <p className="text-muted-foreground max-w-prose">
        This page isn&apos;t available without an internet connection. Reconnect and try again — any
        pages you&apos;ve already visited will still load.
      </p>
    </PageContainer>
  );
}
