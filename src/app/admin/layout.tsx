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
        <section className="py-6">{children}</section>
      </ContentContainer>
    </PageContainer>
  );
}
