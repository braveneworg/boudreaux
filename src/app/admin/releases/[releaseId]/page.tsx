import ReleaseForm from '@/app/components/forms/release-form';

interface ReleaseDetailPageProps {
  params: Promise<{ releaseId: string }>;
}

export default async function ReleaseDetailPage({ params }: ReleaseDetailPageProps) {
  const { releaseId } = await params;
  return <ReleaseForm releaseId={releaseId} />;
}
