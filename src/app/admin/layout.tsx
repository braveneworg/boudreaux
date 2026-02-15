/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ContentContainer } from '../components/ui/content-container';
import PageContainer from '../components/ui/page-container';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer>
      <ContentContainer>
        <section>{children}</section>
      </ContentContainer>
    </PageContainer>
  );
}
