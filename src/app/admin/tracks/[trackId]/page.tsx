import TrackForm from '@/app/components/forms/track-form';

interface TrackDetailPageProps {
  params: Promise<{ trackId: string }>;
}

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { trackId } = await params;
  return <TrackForm trackId={trackId} />;
}
