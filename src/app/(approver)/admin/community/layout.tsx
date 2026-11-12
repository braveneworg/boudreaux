/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The shell of the approver section at `/admin/community`, the one part of the
 * admin area a manager reaches (ADR-0025).
 *
 * It sits in its own route group, outside `src/app/admin/`, so the admin
 * layout's admin-only gate does not wrap it and a manager is never inside the
 * admin layout. That matters because a layout does not render again when a
 * reader moves between its pages on the client: were a manager let into the
 * admin layout for this section, nothing would stop them at the next admin
 * page. Each page here also asks for its own access, for the same reason.
 */
import { AdminNav } from '@/app/admin/components/admin-nav';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { requireApprover } from '@/lib/community/community-session';
import { isAdminRole } from '@/lib/utils/roles';

/** The only admin section a manager reaches. */
const MANAGER_SECTIONS = ['/admin/community'] as const;

export default async function ApproverLayout({ children }: { children: React.ReactNode }) {
  const user = await requireApprover('approver');

  return (
    <PageContainer>
      <ContentContainer className="zine-accent-kraft">
        <AdminNav hrefs={isAdminRole(user.role) ? undefined : MANAGER_SECTIONS} />
        <section className="pt-3 pb-6 **:data-[slot=breadcrumb-menu]:pb-2">{children}</section>
      </ContentContainer>
    </PageContainer>
  );
}
