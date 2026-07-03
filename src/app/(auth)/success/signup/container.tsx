/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { usePathname } from 'next/navigation';

import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { PageSectionParagraph } from '@/app/components/ui/page-section-paragraph';
import { ImageHeading } from '@/components/ui/image-heading';
import { ZinePanel } from '@/components/ui/zine-panel';

export const SuccessContainer = ({ email }: { email: string }): React.ReactElement => {
  const path = usePathname();
  const isSignupPath = path === '/signup';

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel
          chat
          accent="kraft"
          breadcrumbs={[
            { anchorText: isSignupPath ? 'Sign Up' : 'Sign In', url: '#', isActive: true },
          ]}
        >
          <ImageHeading
            src="/media/headings/SUCCESS.webp"
            alt="success"
            imageHeight={480}
            priority
          />
          {/* Copy stays centered at reading width inside the full-width panel */}
          <div className="mx-auto w-full max-w-lg">
            <PageSectionParagraph>
              Check your email. A link was sent to{' '}
              <a href={`mailto:${email}`}>
                <strong>{email}</strong>
              </a>{' '}
              to sign in.
            </PageSectionParagraph>
          </div>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
};
