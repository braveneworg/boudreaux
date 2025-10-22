import ProfileForm from '@/app/components/forms/profile-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { StickyBreadcrumbWrapper } from '@/app/components/ui/sticky-breadcrumb-wrapper';

export default async function ProfilePage() {
  return (
    <>
      <div className="container mx-auto w-full max-w-full px-4 pt-8 pb-0">
        <StickyBreadcrumbWrapper offsetTop={32}>
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
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
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
