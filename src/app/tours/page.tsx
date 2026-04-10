/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';

import { ToursPageClient } from './components/tours-page-client';

/**
 * Public tours listing page with search functionality
 * Hybrid component: Server Component wrapper with Client Component for search
 */
export default async function ToursPage() {
  const url = getInternalApiUrl('/api/tours');
  const res = await fetch(url, { cache: 'no-store' });
  const tours = res.ok ? ((await res.json()).tours ?? []) : [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Tours</h1>
        <p className="text-lg text-muted-foreground">
          Search and browse upcoming and recent tour dates
        </p>
      </div>

      <ToursPageClient tours={tours} />
    </div>
  );
}
