import GroupForm from '@/app/components/forms/group-form';

interface GroupDetailPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupDetailPage({ params }: GroupDetailPageProps) {
  const { groupId } = await params;
  return <GroupForm groupId={groupId} />;
}
