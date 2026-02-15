/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Card, CardContent } from '@/app/components/ui/card';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PageSection } from '@/app/components/ui/page-section';
import { PageSectionParagraph } from '@/app/components/ui/page-section-paragraph';

export default function TermsAndConditionsPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu
          items={[
            { anchorText: 'Legal', url: '/legal', isActive: false },
            {
              anchorText: 'Terms and Conditions',
              url: '/legal/terms-and-conditions',
              isActive: true,
            },
          ]}
        />
        <Card>
          <CardContent>
            <h1 id="terms-and-conditions">Terms and Conditions</h1>
            <PageSectionParagraph>
              <strong>Last Updated: November 4, 2025</strong>
            </PageSectionParagraph>
            <PageSectionParagraph>
              Welcome to our music platform. By accessing or using this web application, you agree
              to be bound by these Terms and Conditions. Please read them carefully.
            </PageSectionParagraph>

            <PageSection id="acceptance" title="1. Acceptance of Terms">
              <PageSectionParagraph>
                By creating an account, accessing, or using our service, you acknowledge that you
                have read, understood, and agree to be bound by these Terms and Conditions and our
                Privacy Policy. If you do not agree, you may not use this service.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="eligibility" title="2. Eligibility">
              <PageSectionParagraph>
                You must be at least 13 years of age to use this service. If you are between 13 and
                18, you must have your parent or legal guardian&apos;s permission to use this
                service. By using this service, you represent and warrant that you meet these
                requirements.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="account-registration" title="3. Account Registration">
              <PageSectionParagraph>
                You agree to provide accurate, current, and complete information during registration
                and to update such information to keep it accurate, current, and complete. You are
                responsible for safeguarding your password and for all activities that occur under
                your account. You must notify us immediately of any unauthorized use of your
                account.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="acceptable-use" title="4. Acceptable Use">
              <h3 className="mb-4 mt-6 text-xl font-semibold">You May:</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Stream and download music for personal, non-commercial use as permitted</li>
                <li>Create and share playlists</li>
                <li>Follow artists and receive updates</li>
                <li>
                  Interact with content through likes, comments, and shares in accordance with these
                  terms
                </li>
                <li>Upload content that you own or have the rights to share</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">You May Not:</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  Use the service for any illegal purpose or in violation of any local, state,
                  national, or international law
                </li>
                <li>Violate or infringe upon the intellectual property rights of others</li>
                <li>
                  Upload, post, or transmit any content that is unlawful, harmful, threatening,
                  abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable
                </li>
                <li>
                  Distribute viruses, malware, or any other technologies that may harm the service
                  or other users
                </li>
                <li>
                  Attempt to gain unauthorized access to any portion of the service, other accounts,
                  or computer systems
                </li>
                <li>
                  Use any automated means (bots, scrapers, crawlers) to access or collect data from
                  the service
                </li>
                <li>
                  Circumvent, disable, or interfere with security-related features or features that
                  prevent copying of content
                </li>
                <li>
                  Remove, alter, or obscure any copyright, trademark, or other proprietary rights
                  notices
                </li>
                <li>
                  Impersonate any person or entity or falsely state or misrepresent your affiliation
                  with any person or entity
                </li>
                <li>
                  Engage in any form of spam, including mass messaging or repetitive content posting
                </li>
                <li>Share your account credentials with others or create multiple accounts</li>
                <li>
                  Download or attempt to download content unless a download button or link is
                  expressly provided
                </li>
                <li>
                  Re-upload or redistribute content obtained from this platform without explicit
                  permission
                </li>
              </ul>
            </PageSection>

            <PageSection id="content-ownership" title="5. Content Ownership and Licensing">
              <h3 className="mb-4 mt-6 text-xl font-semibold">Our Content</h3>
              <PageSectionParagraph>
                All music, artwork, text, graphics, logos, and other content provided by us or our
                artists (collectively, &ldquo;Platform Content&rdquo;) is owned by us, our
                licensors, or the respective artists. Platform Content is protected by copyright,
                trademark, and other intellectual property laws.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">
                Your License to Use Platform Content
              </h3>
              <PageSectionParagraph>
                We grant you a limited, non-exclusive, non-transferable, revocable license to access
                and use Platform Content for personal, non-commercial purposes in accordance with
                these Terms. This license does not include any right to:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Resell or make commercial use of the service or Platform Content</li>
                <li>
                  Download (except where explicitly permitted), copy, or reproduce Platform Content
                </li>
                <li>Make derivative works from Platform Content</li>
                <li>Use any data mining, robots, or similar data gathering methods</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">User-Generated Content</h3>
              <PageSectionParagraph>
                If you upload, submit, or post content to the service (&ldquo;User Content&rdquo;),
                you grant us a worldwide, non-exclusive, royalty-free, transferable license to use,
                reproduce, distribute, display, and perform that User Content in connection with
                operating and promoting the service. You retain all ownership rights in your User
                Content.
              </PageSectionParagraph>
              <PageSectionParagraph>You represent and warrant that:</PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>You own or have the necessary rights to your User Content</li>
                <li>
                  Your User Content does not infringe any third party&apos;s intellectual property
                  rights
                </li>
                <li>Your User Content complies with these Terms</li>
              </ul>
            </PageSection>

            <PageSection id="copyright-dmca" title="6. Copyright and DMCA">
              <PageSectionParagraph>
                We respect the intellectual property rights of others and expect users to do the
                same. If you believe your copyrighted work has been infringed, please contact our
                designated copyright agent with:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Your physical or electronic signature</li>
                <li>Identification of the copyrighted work</li>
                <li>Identification of the infringing material and its location</li>
                <li>Your contact information</li>
                <li>
                  A statement that you have a good faith belief that the use is not authorized
                </li>
                <li>
                  A statement that the information is accurate and you are authorized to act on
                  behalf of the copyright owner
                </li>
              </ul>
              <PageSectionParagraph>
                We will respond to legitimate notices in accordance with the Digital Millennium
                Copyright Act (DMCA).
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="prohibited-content" title="7. Prohibited Content">
              <PageSectionParagraph>
                The following types of content are strictly prohibited:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  Content that infringes copyright, trademark, or other intellectual property rights
                </li>
                <li>Sexually explicit or pornographic material</li>
                <li>
                  Content that promotes violence, discrimination, or hatred against individuals or
                  groups
                </li>
                <li>Content that exploits or endangers minors</li>
                <li>Content containing personal information of others without consent</li>
                <li>Spam, malware, or phishing attempts</li>
                <li>False or misleading information</li>
                <li>Content that violates any applicable law or regulation</li>
              </ul>
            </PageSection>

            <PageSection id="content-moderation" title="8. Content Moderation">
              <PageSectionParagraph>
                We reserve the right, but have no obligation, to monitor, review, edit, or remove
                any User Content at our sole discretion, at any time and for any reason, without
                notice. We may suspend or terminate accounts that violate these Terms.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="privacy-data" title="9. Privacy and Data">
              <PageSectionParagraph>
                Your use of the service is also governed by our Privacy Policy. We collect, use, and
                protect your personal information as described in that policy. By using this
                service, you consent to our data practices.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="subscriptions-payments" title="10. Subscriptions and Payments">
              <h3 className="mb-4 mt-6 text-xl font-semibold">Free Tier</h3>
              <PageSectionParagraph>
                We may offer a free tier with limited features and advertising.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Paid Subscriptions</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  Subscription fees are billed in advance on a recurring basis (monthly or annually)
                </li>
                <li>All fees are non-refundable except as required by law</li>
                <li>
                  We reserve the right to change subscription pricing with 30 days&apos; notice
                </li>
                <li>
                  You may cancel your subscription at any time; cancellation takes effect at the end
                  of the current billing period
                </li>
                <li>If payment fails, we may suspend or terminate your subscription</li>
              </ul>
            </PageSection>

            <PageSection id="third-party-services" title="11. Third-Party Services">
              <PageSectionParagraph>
                The service may contain links to third-party websites or services. We are not
                responsible for the content, privacy policies, or practices of any third-party
                services. You acknowledge and agree that we shall not be liable for any damages
                arising from your use of third-party services.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="termination" title="12. Termination">
              <PageSectionParagraph>
                We may terminate or suspend your account and access to the service immediately,
                without prior notice or liability, for any reason, including breach of these Terms.
                Upon termination, your right to use the service will immediately cease. All
                provisions of these Terms that by their nature should survive termination shall
                survive, including ownership provisions, warranty disclaimers, and limitations of
                liability.
              </PageSectionParagraph>
              <PageSectionParagraph>
                You may terminate your account at any time by contacting us or using the account
                deletion feature in your settings.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="disclaimers" title="13. Disclaimers">
              <PageSectionParagraph>
                THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
                WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
                IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT.
              </PageSectionParagraph>
              <PageSectionParagraph>We do not warrant that:</PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>The service will be uninterrupted, secure, or error-free</li>
                <li>The results obtained from the service will be accurate or reliable</li>
                <li>The quality of any content or service will meet your expectations</li>
                <li>Any errors in the service will be corrected</li>
              </ul>
            </PageSection>

            <PageSection id="limitation-liability" title="14. Limitation of Liability">
              <PageSectionParagraph>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WE BE LIABLE FOR ANY
                INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
                PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA,
                USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Your access to or use of or inability to access or use the service</li>
                <li>Any conduct or content of any third party on the service</li>
                <li>Unauthorized access, use, or alteration of your content</li>
              </ul>
              <PageSectionParagraph>
                OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE MONTHS
                PRIOR TO THE EVENT GIVING RISE TO LIABILITY, OR ONE HUNDRED DOLLARS ($100),
                WHICHEVER IS GREATER.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="indemnification" title="15. Indemnification">
              <PageSectionParagraph>
                You agree to defend, indemnify, and hold harmless our company, its affiliates,
                licensors, and service providers, and their respective officers, directors,
                employees, contractors, agents, and representatives from and against any claims,
                liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including
                reasonable attorneys&apos; fees) arising out of or relating to your violation of
                these Terms or your use of the service.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="geographic-restrictions" title="16. Geographic Restrictions">
              <PageSectionParagraph>
                The service is operated from the United States. If you access the service from
                outside the United States, you are responsible for compliance with local laws. We
                make no representation that content available on the service is appropriate or
                available in other locations.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="changes-terms" title="17. Changes to Terms">
              <PageSectionParagraph>
                We reserve the right to modify these Terms at any time. We will provide notice of
                material changes by posting the new Terms on the service and updating the
                &ldquo;Last Updated&rdquo; date. Your continued use of the service after changes
                become effective constitutes acceptance of the revised Terms.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="governing-law" title="18. Governing Law and Dispute Resolution">
              <PageSectionParagraph>
                These Terms shall be governed by and construed in accordance with the laws of the
                State of Connecticut, without regard to its conflict of law provisions.
              </PageSectionParagraph>
              <PageSectionParagraph>
                Any disputes arising from these Terms or your use of the service shall be resolved
                through binding arbitration in accordance with the rules of the American Arbitration
                Association, except that either party may seek injunctive relief in court to prevent
                infringement of intellectual property rights.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="general-provisions" title="19. General Provisions">
              <h3 className="mb-4 mt-6 text-xl font-semibold">Entire Agreement</h3>
              <PageSectionParagraph>
                These Terms constitute the entire agreement between you and us regarding the service
                and supersede all prior agreements.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Severability</h3>
              <PageSectionParagraph>
                If any provision of these Terms is found to be unenforceable, the remaining
                provisions will remain in full force and effect.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Waiver</h3>
              <PageSectionParagraph>
                No waiver of any term shall be deemed a further or continuing waiver of such term or
                any other term.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Assignment</h3>
              <PageSectionParagraph>
                You may not assign or transfer these Terms without our prior written consent. We may
                assign our rights and obligations without restriction.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Force Majeure</h3>
              <PageSectionParagraph>
                We shall not be liable for any failure to perform due to circumstances beyond our
                reasonable control.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="contact" title="20. Contact Information">
              <PageSectionParagraph>
                For questions about these Terms or to report violations, please contact us at:
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Fake Four Inc.</strong>
                <br />
                Email: legal@fakefour.com
                <br />
                Address: New Haven, Connecticut
              </PageSectionParagraph>
            </PageSection>

            <PageSectionParagraph className="mt-8 border-t border-zinc-300 pt-6 text-center text-sm italic">
              By using this service, you acknowledge that you have read and understood these Terms
              and Conditions and agree to be bound by them.
            </PageSectionParagraph>

            <PageSectionParagraph className="text-sm italic">
              This Terms and Conditions document was last updated on November 4, 2025 and is
              effective immediately.
            </PageSectionParagraph>
          </CardContent>
        </Card>
      </ContentContainer>
    </PageContainer>
  );
}
