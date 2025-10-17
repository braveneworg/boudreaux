import ProfileForm from '@/app/components/forms/profile-form';

export default async function ProfilePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">
          Manage your account settings and personal information. We <strong>DO NOT sell</strong>{' '}
          your information.
        </p>
      </div>

      <ProfileForm />
    </div>
  );
}
