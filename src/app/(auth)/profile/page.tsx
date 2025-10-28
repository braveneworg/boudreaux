import { headers } from 'next/headers';
import { userAgentFromString } from 'next/server';

import ProfileForm from '@/app/components/forms/profile-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { StickyBreadcrumbWrapper } from '@/app/components/ui/sticky-breadcrumb-wrapper';

export default async function ProfilePage() {
  const userAgent = (await headers()).get('user-agent') || '';
  const { device } = userAgentFromString(userAgent);
  const isMobile = device?.type === 'mobile' || device?.type === 'tablet';

  return (
    <>
      <div className="container mx-auto w-full max-w-full px-4 pb-0">
        <StickyBreadcrumbWrapper isVisible={!isMobile} offsetTop={32}>
          <BreadcrumbMenu
            items={[
              {
                anchorText: 'Profile',
                url: '/profile',
                isActive: true,
              },
            ]}
          />
        </StickyBreadcrumbWrapper>
        <div className="mb-4">
          <h1>Profile</h1>
          <p className="text-muted-foreground">
            Manage your account settings and personal information. We <strong>DO NOT sell</strong>{' '}
            your information.
          </p>
        </div>
      </div>
      <div className="container mx-auto w-full max-w-full px-4 pb-8">
        <ProfileForm />
      </div>
    </>
  );
}
