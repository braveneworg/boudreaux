/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Card } from '@/app/components/ui/card';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PageSectionParagraph } from '@/app/components/ui/page-section-paragraph';

const SuccessContainer = ({ email }: { email: string }) => (
  <PageContainer>
    <ContentContainer>
      <Card>
        <h1 className="pt-3">Success! 🎉</h1>
        <PageSectionParagraph>
          Check your email. A link was sent to{' '}
          <a href={`mailto:${email}`}>
            <strong>{email}</strong>
          </a>{' '}
          to sign in.
        </PageSectionParagraph>
      </Card>
    </ContentContainer>
  </PageContainer>
);

export default SuccessContainer;
