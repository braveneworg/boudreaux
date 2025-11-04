import Image from 'next/image';
import Link from 'next/link';

import { BreadcrumbMenu } from '../components/ui/breadcrumb-menu';
import { Card, CardContent } from '../components/ui/card';
import { ContentContainer } from '../components/ui/content-container';
import PageContainer from '../components/ui/page-container';
import { PageSection } from '../components/ui/page-section';
import { PageSectionParagraph } from '../components/ui/page-section-paragraph';

export default function AboutPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={[{ anchorText: 'About', url: '/about', isActive: true }]} />
        <Card>
          <CardContent>
            <h1 id="about-fake-four-inc">About fake four inc.</h1>
            <PageSectionParagraph>
              <Image
                width={92}
                height={92}
                src="/media/ceschi-and-david-ramos-brothers-and-fouders-of-fake-four-inc.jpeg"
                alt="Ceschi and David Ramos, founders of Fake Four Inc. in 2008"
                className="inline-block float-right ml-4 rounded-full shadow-md border-2 border-zinc-50"
                priority
              />
              <strong>Fake Four Inc.</strong> is an independent record label based in New Haven,
              Connecticut. Founded in 2008 by brothers <strong>Ceschi and David Ramos</strong>, the
              label has become a significant force in progressive hip-hop and experimental music.
            </PageSectionParagraph>
            <PageSection id="history" title="History">
              <PageSectionParagraph>
                The Ramos brothers started Fake Four Inc. with help from Grimm Image Records in San
                Bernardino, California and Squids Eye Recording Collective in Dayton, Ohio as an
                outlet to release and distribute their personal music projects and those of their
                friends.
              </PageSectionParagraph>
              <PageSectionParagraph>
                <Link href="https://davidramos.bandcamp.com/album/this-up-here">
                  <Image
                    src="/media/listen-david-ramos-this-up-there-bc.png"
                    alt="Listen to David Ramos' This Up Here on Bandcamp"
                    width={380}
                    height={42}
                    className="float-left mr-4 mb-2 rounded-md shadow-md border-2 border-zinc-50"
                  />
                </Link>
                The first full-length release came with <em>This Up Here</em> by David Ramos on May
                20, 2008. David Ramos, a co-founder of the label, was recognized by Modern Drummer
                magazine as one of the Top 10 Progressive drummers.
              </PageSectionParagraph>
              <PageSectionParagraph>
                In 2010, Fake Four Inc. became official label partners with Circle Into Square in
                Portland, Oregon, taking on production and distribution duties. The label is
                exclusively distributed by Sonic Unyon in Canada and Redeye Distribution worldwide.
              </PageSectionParagraph>
              <PageSectionParagraph>
                In 2013, a successful Indiegogo campaign raised over $52,000 to cover manufacturing
                costs and operating expenses, demonstrating the strong community support for the
                label.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="style-and-philosophy" title="Style & Philosophy">
              <PageSectionParagraph>
                Fake Four Inc. does not adhere to genre specifications, pushing the boundaries of
                indie rap and experimental music. Brett Uddenberg of URB magazine praised the label
                for its innovative approach to indie hip-hop.
              </PageSectionParagraph>
              <PageSectionParagraph>
                Chris Faraone of The Phoenix wrote:{' '}
                <em>
                  &ldquo;you heard it here first: Fake Four is the most important label in
                  progressive hip-hop right now.&rdquo;
                </em>
              </PageSectionParagraph>
              <PageSectionParagraph>
                The label has been noted for its intra-label collaborations, with artists signed to
                the label self-booking tours through the United States, Canada, and Europe.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="notable-artists" title="Notable Artists">
              <PageSectionParagraph>
                Fake Four Inc. has released albums by numerous influential artists including:
              </PageSectionParagraph>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ul className="list-inside list-disc text-zinc-700">
                  <li>Astronautalis</li>
                  <li>Blue Sky Black Death</li>
                  <li>Busdriver</li>
                  <li>Ceschi</li>
                  <li>Dark Time Sunshine</li>
                </ul>
                <ul className="list-inside list-disc text-zinc-700">
                  <li>Electric President</li>
                  <li>Factor Chandelier</li>
                  <li>Myka 9</li>
                  <li>Noah23</li>
                  <li>Open Mike Eagle</li>
                </ul>
                <ul className="list-inside list-disc text-zinc-700">
                  <li>Onry Ozzborn</li>
                  <li>Sadistik</li>
                  <li>Sole</li>
                  <li>Gregory Pepper</li>
                  <li>And many more...</li>
                </ul>
              </div>
            </PageSection>

            <PageSection id="chart-success" title="Chart Success">
              <PageSectionParagraph>
                Nearly all releases on the label have placed on CMJ charts, including{' '}
                <em>Vessel</em> by Dark Time Sunshine which reached #2 on the CMJ Hip Hop ranking.
                This consistent chart performance demonstrates the label&apos;s ability to produce
                quality music that resonates with audiences and critics alike.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="recent-releases" title="Recent Releases">
              <PageSectionParagraph>
                The label continues to release innovative music, including anniversary reissues such
                as Blue Sky Black Death&apos;s <em>NOIR 10 Year Anniversary Reissue</em> and
                Ceschi&apos;s <em>They Hate Francisco False 15 Year Remastered Pressing</em>.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="community-and-impact" title="Community & Impact">
              <PageSectionParagraph>
                Since its inception, Fake Four Inc. has been a self-sufficient label, maintaining
                its independence while supporting a diverse roster of artists. The label represents
                more than just a business&mdash;it&apos;s a community of artists pushing the
                boundaries of underground hip-hop and experimental music.
              </PageSectionParagraph>
            </PageSection>
          </CardContent>
        </Card>
      </ContentContainer>
    </PageContainer>
  );
}
