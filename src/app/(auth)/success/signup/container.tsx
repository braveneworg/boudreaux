/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { usePathname } from 'next/navigation';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PageSectionParagraph } from '@/app/components/ui/page-section-paragraph';

const SuccessContainer = ({ email }: { email: string }) => {
  const path = usePathname();
  const isSignupPath = path === '/signup';

  return (
    <PageContainer>
      <BreadcrumbMenu
        className="mt-2"
        items={[{ anchorText: isSignupPath ? 'Sign Up' : 'Sign In', url: '#', isActive: true }]}
      />
      <ContentContainer>
        <h1 className="pt-3">Success! 🎉</h1>
        <PageSectionParagraph>
          Check your email. A link was sent to{' '}
          <a href={`mailto:${email}`}>
            <strong>{email}</strong>
          </a>{' '}
          to sign in.
        </PageSectionParagraph>
      </ContentContainer>
    </PageContainer>
  );
};

export default SuccessContainer;
