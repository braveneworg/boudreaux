import FeaturedArtistForm from '@/app/components/forms/featured-artist-form';

interface EditFeaturedArtistPageProps {
  params: Promise<{ featuredArtistId: string }>;
}

export default async function EditFeaturedArtistPage({ params }: EditFeaturedArtistPageProps) {
  const { featuredArtistId } = await params;
  return <FeaturedArtistForm featuredArtistId={featuredArtistId} />;
}
