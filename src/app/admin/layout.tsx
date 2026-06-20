/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { requireRole } from '@/lib/utils/auth/require-role';
import { ContentContainer } from '@/ui/content-container';
import { PageContainer } from '@/ui/page-container';

import { AdminNav } from './components/admin-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Enforce admin role for all admin routes
  await requireRole('admin');

  return (
    <PageContainer>
      <ContentContainer>
        <AdminNav />
        {/* Tighter top gap so the breadcrumb groups with the nav above it;
            a little padding under the breadcrumb adds breathing room before the
            first heading (padding, since space-y margins collapse). */}
        <section className="pt-3 pb-6 **:data-[slot=breadcrumb-menu]:pb-2">{children}</section>
      </ContentContainer>
    </PageContainer>
  );
}
