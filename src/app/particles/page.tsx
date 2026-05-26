/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticleGeneratorDemo } from '@/ui/backgrounds/particle-generator';
import { ContentContainer } from '@/ui/content-container';
import { PageContainer } from '@/ui/page-container';

export default function ParticleGeneratorPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <ParticleGeneratorDemo />
      </ContentContainer>
    </PageContainer>
  );
}
