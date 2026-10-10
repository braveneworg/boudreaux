/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { notFound } from 'next/navigation';

import { ArtistBio } from '@/app/components/artist-bio';
import { DisplayImageCollage } from '@/app/components/display-image-collage';
import { LatestReleaseLink } from '@/app/components/latest-release-link';
import { ContactLinkSection, LinkSection } from '@/app/components/link-section';
import { Badge } from '@/app/components/ui/badge';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { resolveDisplayImages } from '@/lib/utils/display-images';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import { splitList } from '@/lib/utils/split-list';
import { formatVocabularyTerm } from '@/utils/vocabulary-term';

import { getPublicArtist } from './get-public-artist';
import { toLatestRelease } from './latest-release';

import type { Metadata } from 'next';

interface ArtistDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtistDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getPublicArtist(slug);
  if (!artist) return { title: 'Artist Not Found' };
  const displayName = getArtistDisplayName(artist);
  // The short bio is rich HTML; the meta description takes its text.
  const shortBioText = artist.shortBio ? sanitizeBioText(artist.shortBio) : '';
  return {
    title: displayName,
    description: shortBioText || `Listen to releases by ${displayName}.`,
  };
}

/**
 * The artist page, design A ("contact sheet"): the proof-sheet collage of
 * the display images, the genres and the curated link sections in the left
 * third; the name, the latest release and the biography on the right. A
 * Server Component: the graph is read once per request (shared with the
 * metadata) and parsed to the public wire shape; the collage and the
 * latest-release line are the only client islands. On a phone the order is
 * name, filmstrip, genres and links, then the biography.
 */
export default async function ArtistDetailPage({ params }: ArtistDetailPageProps) {
  const { slug } = await params;
  const artist = await getPublicArtist(slug);
  if (!artist) notFound();

  const displayName = getArtistDisplayName(artist);
  const genres = splitList(artist.genres);
  // The chosen display images in order; a grandfathered artist with none
  // chosen keeps the ADR-0008 fallback tiers (decision 5).
  const images = resolveDisplayImages(artist.bioImages);
  const latest = toLatestRelease(artist);
  const { links } = artist;

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel
          chat
          accent="orange"
          tape={false}
          breadcrumbs={[
            { anchorText: 'Artists', url: '/artists', isActive: false },
            {
              anchorText: displayName,
              url: `/artists/${slug}`,
              isActive: true,
              className: 'max-w-[200px] truncate sm:max-w-none sm:overflow-visible',
            },
          ]}
        >
          {/* The grid is the panel's one child: the breadcrumb trail stays
              above it instead of auto-placing into the grid's spare cell. */}
          <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr]">
            <header className="space-y-3 lg:col-start-2 lg:row-start-1">
              <ZineHeading level={1} className="mb-2">
                {displayName}
              </ZineHeading>
              {latest ? (
                <LatestReleaseLink
                  release={latest}
                  artistName={displayName}
                  slug={slug}
                  className="text-lg"
                />
              ) : (
                <p className="text-zinc-700">No releases yet.</p>
              )}
            </header>

            {/* `lg:pt-4` sets the sheet's top edge on the cap line of the name
              (the heading's top padding, margin and line-box lead). */}
            <aside className="space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:pt-4">
              <DisplayImageCollage images={images} displayName={displayName} />
              {genres.length > 0 && (
                <ul aria-label="Genres" className="flex flex-wrap gap-2">
                  {genres.map((genre) => (
                    <li key={genre}>
                      <Badge variant="secondary">{formatVocabularyTerm(genre)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {links ? (
                <>
                  <LinkSection heading="Websites" section="websites" links={links.websites} />
                  <LinkSection heading="Social Media" section="social" links={links.social} />
                  <ContactLinkSection groups={links.contact} />
                </>
              ) : null}
            </aside>

            <ArtistBio html={artist.bio} className="lg:col-start-2 lg:row-start-2" />
          </div>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
