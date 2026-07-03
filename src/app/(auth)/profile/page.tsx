/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ProfileForm } from '@/app/components/forms/profile-form';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';

export default async function ProfilePage() {
  return (
    <PageContainer>
      <ContentContainer>
        {/* The breadcrumb docks inside the first profile section's panel. */}
        <ProfileForm />
      </ContentContainer>
    </PageContainer>
  );
}
