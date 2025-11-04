import ProfileForm from '@/app/components/forms/profile-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';

export default async function ProfilePage() {
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu
          items={[
            {
              anchorText: 'Profile',
              url: '/profile',
              isActive: true,
            },
          ]}
        />
        <ProfileForm />
      </ContentContainer>
    </PageContainer>
  );
}
