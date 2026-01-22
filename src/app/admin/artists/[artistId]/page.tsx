import ArtistForm from '@/app/components/forms/artist-form';

interface ArtistDetailPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistDetailPage({ params }: ArtistDetailPageProps) {
  const { artistId } = await params;
  return <ArtistForm artistId={artistId} />;
}
