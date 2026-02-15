/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Card, CardContent } from '@/app/components/ui/card';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PageSection } from '@/app/components/ui/page-section';
import { PageSectionParagraph } from '@/app/components/ui/page-section-paragraph';

export default function PrivacyPolicyPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu
          items={[
            { anchorText: 'Legal', url: '/legal', isActive: false },
            { anchorText: 'Privacy Policy', url: '/legal/privacy-policy', isActive: true },
          ]}
        />
        <Card>
          <CardContent>
            <h1 id="privacy-policy">Privacy Policy</h1>
            <PageSectionParagraph>
              <strong>Last Updated: November 4, 2025</strong>
            </PageSectionParagraph>
            <PageSectionParagraph>
              At Fake Four Inc., we take your privacy seriously. This Privacy Policy explains how we
              collect, use, protect, and handle your personal information when you use our music
              streaming platform. We are committed to protecting your privacy and being transparent
              about our data practices.
            </PageSectionParagraph>

            <PageSection id="privacy-commitment" title="Our Privacy Commitment">
              <PageSectionParagraph>
                <strong>
                  We do not sell, rent, or share your personal information with third parties for
                  their marketing purposes.
                </strong>{' '}
                We collect and use your information solely to provide, improve, and personalize your
                music experience on our platform.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="information-we-collect" title="1. Information We Collect">
              <h3 className="mb-4 mt-6 text-xl font-semibold">Information You Provide to Us</h3>

              <PageSectionParagraph>
                <strong>Account Information</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Email address</li>
                <li>Username and display name</li>
                <li>Password (encrypted and never stored in plain text)</li>
                <li>Date of birth (to verify age eligibility)</li>
                <li>Profile picture (optional)</li>
                <li>Bio and social media links (optional)</li>
              </ul>

              <PageSectionParagraph>
                <strong>Payment Information</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  When you subscribe to a paid plan, our secure payment processor collects your
                  billing information
                </li>
                <li>We do not store complete credit card numbers on our servers</li>
                <li>
                  We retain only limited payment information (last 4 digits, expiration date) for
                  account management
                </li>
              </ul>

              <PageSectionParagraph>
                <strong>User-Generated Content</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Playlists you create</li>
                <li>Comments and reviews you post</li>
                <li>Music preferences and ratings</li>
                <li>Profile customizations</li>
                <li>Messages sent through our platform features</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">
                Information We Collect Automatically
              </h3>

              <PageSectionParagraph>
                <strong>Usage Information</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Songs you listen to, skip, or replay</li>
                <li>Listening history and duration</li>
                <li>Search queries</li>
                <li>Features you use and interact with</li>
                <li>Time, frequency, and duration of your activities</li>
                <li>Playlists you create, follow, or subscribe to</li>
              </ul>

              <PageSectionParagraph>
                <strong>Device Information</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Device type and model</li>
                <li>Operating system and version</li>
                <li>Browser type and version</li>
                <li>IP address</li>
                <li>Unique device identifiers</li>
                <li>Mobile network information</li>
              </ul>

              <PageSectionParagraph>
                <strong>Location Information</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>General location based on IP address (country, state, city)</li>
                <li>
                  We do not collect precise GPS location unless you explicitly grant permission for
                  specific features
                </li>
              </ul>

              <PageSectionParagraph>
                <strong>Cookies and Similar Technologies</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  We use cookies, web beacons, and similar technologies to enhance your experience
                </li>
                <li>
                  These help us remember your preferences, keep you logged in, and understand how
                  you use our service
                </li>
                <li>You can control cookie preferences through your browser settings</li>
              </ul>
            </PageSection>

            <PageSection id="how-we-use-information" title="2. How We Use Your Information">
              <PageSectionParagraph>
                We use your information exclusively to provide and improve our service:
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">To Provide Our Service</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Create and manage your account</li>
                <li>Process your subscription and payments</li>
                <li>Deliver music streaming and download functionality</li>
                <li>Enable playlist creation and sharing</li>
                <li>Allow you to interact with other users (comments, follows, etc.)</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">To Personalize Your Experience</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Recommend music based on your listening history and preferences</li>
                <li>Create personalized playlists and radio stations</li>
                <li>Suggest artists and albums you might enjoy</li>
                <li>Customize your homepage and feed</li>
                <li>Remember your preferences and settings</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">To Improve Our Service</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Analyze usage patterns to understand how people use our platform</li>
                <li>Identify and fix technical issues</li>
                <li>Test new features and improvements</li>
                <li>Optimize audio quality and streaming performance</li>
                <li>Improve our recommendation algorithms</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">To Communicate With You</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Send you service-related notifications (account changes, security alerts)</li>
                <li>Provide customer support when you contact us</li>
                <li>Send you important updates about our service (with your consent)</li>
                <li>Notify you about new releases from artists you follow (with your consent)</li>
                <li>Share personalized music recommendations (with your consent)</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">To Ensure Security and Compliance</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Protect against fraud, abuse, and security threats</li>
                <li>Verify account authenticity</li>
                <li>Enforce our Terms and Conditions</li>
                <li>Comply with legal obligations</li>
                <li>Protect the rights and safety of our users</li>
              </ul>
            </PageSection>

            <PageSection id="information-sharing" title="3. Information Sharing and Disclosure">
              <PageSectionParagraph>
                <strong>
                  We do not sell your personal information. We do not rent your personal
                  information. We do not share your personal information for third-party marketing
                  purposes.
                </strong>
              </PageSectionParagraph>
              <PageSectionParagraph>
                We only share your information in the following limited circumstances:
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">With Your Consent</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  When you explicitly choose to share information (e.g., making a playlist public)
                </li>
                <li>
                  When you connect your account to third-party services (e.g., social media sharing)
                </li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">With Service Providers</h3>
              <PageSectionParagraph>
                We work with trusted third-party service providers who help us operate our platform.
                These partners are contractually obligated to:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Use your information only to provide services to us</li>
                <li>Protect your information with appropriate security measures</li>
                <li>Not use your information for their own purposes</li>
              </ul>

              <PageSectionParagraph>
                <strong>Examples of service providers:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Cloud hosting services (to store and deliver content)</li>
                <li>Payment processors (to handle subscriptions)</li>
                <li>Email service providers (to send service notifications)</li>
                <li>Analytics providers (to understand service usage)</li>
                <li>Customer support tools (to assist you)</li>
              </ul>

              <PageSectionParagraph>
                These providers never receive more information than necessary to perform their
                specific function.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">For Legal Reasons</h3>
              <PageSectionParagraph>
                We may disclose your information if required to:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Comply with legal obligations, court orders, or government requests</li>
                <li>Enforce our Terms and Conditions</li>
                <li>Protect the rights, property, or safety of our company, users, or others</li>
                <li>Detect, prevent, or address fraud, security, or technical issues</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Business Transfers</h3>
              <PageSectionParagraph>
                If we are involved in a merger, acquisition, or sale of assets, your information may
                be transferred. We will notify you before your information is transferred and
                becomes subject to a different privacy policy.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Aggregated and Anonymized Data</h3>
              <PageSectionParagraph>
                We may share aggregated or anonymized information that cannot identify you
                personally, such as:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>General listening trends and statistics</li>
                <li>Popular genres or artists</li>
                <li>Demographic insights (without identifying individuals)</li>
              </ul>
            </PageSection>

            <PageSection id="privacy-rights" title="4. Your Privacy Rights and Choices">
              <PageSectionParagraph>You have control over your information:</PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Access and Update</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  View and update your account information at any time through your account settings
                </li>
                <li>Request a copy of your personal data</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Download Your Data</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  Request a downloadable copy of your listening history, playlists, and account
                  information
                </li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Delete Your Information</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Delete specific content (playlists, comments, etc.)</li>
                <li>Request deletion of your account and associated data</li>
                <li>
                  Note: Some information may be retained for legal or legitimate business purposes
                  (e.g., transaction records)
                </li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Communication Preferences</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  Opt out of promotional emails while still receiving essential service
                  notifications
                </li>
                <li>Manage notification preferences in your account settings</li>
                <li>Unsubscribe links are included in all marketing emails</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Cookie Preferences</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Control cookie settings through your browser</li>
                <li>Note that disabling certain cookies may limit functionality</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Do Not Track</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  We respect browser &ldquo;Do Not Track&rdquo; signals where technically feasible
                </li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Cancel Your Subscription</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Cancel your paid subscription at any time from your account settings</li>
                <li>Cancellation takes effect at the end of your billing period</li>
              </ul>
            </PageSection>

            <PageSection id="data-protection" title="5. How We Protect Your Information">
              <PageSectionParagraph>
                We implement industry-standard security measures to protect your data:
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Technical Safeguards</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Encryption of data in transit using SSL/TLS</li>
                <li>Encryption of sensitive data at rest</li>
                <li>Secure password storage using cryptographic hashing</li>
                <li>Regular security assessments and updates</li>
                <li>Firewalls and intrusion detection systems</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Organizational Safeguards</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Limited employee access to personal information (need-to-know basis only)</li>
                <li>Background checks for employees with data access</li>
                <li>Regular security training for staff</li>
                <li>Strict data handling policies and procedures</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Account Security</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Strong password requirements</li>
                <li>Account activity monitoring for suspicious behavior</li>
                <li>Two-factor authentication available (recommended)</li>
                <li>Automatic logout after extended inactivity</li>
              </ul>

              <PageSectionParagraph>
                While we strive to protect your information, no method of transmission or storage is
                100% secure. We cannot guarantee absolute security but are committed to protecting
                your data using best practices.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="data-retention" title="6. Data Retention">
              <PageSectionParagraph>
                We retain your information only as long as necessary:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Active accounts:</strong> We retain your data while your account is active
                </li>
                <li>
                  <strong>Deleted accounts:</strong> Most data is deleted within 30 days of account
                  deletion
                </li>
                <li>
                  <strong>Legal requirements:</strong> Some data may be retained longer to comply
                  with legal obligations (e.g., payment records for tax purposes)
                </li>
                <li>
                  <strong>Backup systems:</strong> Data in backup systems is deleted according to
                  our backup retention schedule
                </li>
              </ul>
            </PageSection>

            <PageSection id="childrens-privacy" title="7. Children's Privacy">
              <PageSectionParagraph>
                Our service is not intended for children under 13 years of age. We do not knowingly
                collect personal information from children under 13. If you are under 13, please do
                not use our service or provide any information. If we learn we have collected
                information from a child under 13, we will delete it promptly.
              </PageSectionParagraph>
              <PageSectionParagraph>
                If you are between 13 and 18, you must have parental or guardian consent to use our
                service.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="international-transfers" title="8. International Data Transfers">
              <PageSectionParagraph>
                Our service is operated from the United States. If you access our service from
                outside the United States, your information will be transferred to, stored, and
                processed in the United States. By using our service, you consent to this transfer.
              </PageSectionParagraph>
              <PageSectionParagraph>
                We take appropriate measures to ensure your data receives an adequate level of
                protection, including:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Standard contractual clauses with international service providers</li>
                <li>Compliance with applicable data protection laws</li>
                <li>Appropriate security safeguards</li>
              </ul>
            </PageSection>

            <PageSection id="california-rights" title="9. California Privacy Rights">
              <PageSectionParagraph>
                If you are a California resident, you have additional rights under the California
                Consumer Privacy Act (CCPA):
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Right to Know:</strong> Request disclosure of the categories and specific
                  pieces of personal information we collect
                </li>
                <li>
                  <strong>Right to Delete:</strong> Request deletion of your personal information
                  (with certain exceptions)
                </li>
                <li>
                  <strong>Right to Opt-Out:</strong> Opt out of the sale of personal information
                  (note: we do not sell personal information)
                </li>
                <li>
                  <strong>Right to Non-Discrimination:</strong> We will not discriminate against you
                  for exercising your privacy rights
                </li>
              </ul>
              <PageSectionParagraph>
                To exercise these rights, contact us at privacy@fakefour.com
              </PageSectionParagraph>
              <PageSectionParagraph>
                We will respond to verified requests within 45 days.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="european-rights" title="10. European Privacy Rights (GDPR)">
              <PageSectionParagraph>
                If you are located in the European Economic Area (EEA), you have rights under the
                General Data Protection Regulation (GDPR):
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Legal Basis for Processing</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Contractual necessity (to provide our service)</li>
                <li>Legitimate interests (to improve and secure our service)</li>
                <li>Consent (for marketing communications and certain data uses)</li>
                <li>Legal obligations (to comply with applicable laws)</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Your Rights</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Right to access your personal data</li>
                <li>Right to rectification of inaccurate data</li>
                <li>Right to erasure (&ldquo;right to be forgotten&rdquo;)</li>
                <li>Right to restrict processing</li>
                <li>Right to data portability</li>
                <li>Right to object to processing</li>
                <li>Right to withdraw consent</li>
                <li>Right to lodge a complaint with a supervisory authority</li>
              </ul>

              <PageSectionParagraph>
                To exercise these rights, contact us at privacy@fakefour.com
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="third-party-services" title="11. Third-Party Services and Links">
              <PageSectionParagraph>
                Our service may contain links to third-party websites, services, or social media
                platforms. This Privacy Policy does not apply to those third-party services. We are
                not responsible for the privacy practices of third parties.
              </PageSectionParagraph>
              <PageSectionParagraph>
                When you connect third-party services to your account (e.g., social media sharing),
                those services may collect information according to their own privacy policies. We
                encourage you to review the privacy policies of any third-party services you use.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="policy-changes" title="12. Changes to This Privacy Policy">
              <PageSectionParagraph>
                We may update this Privacy Policy from time to time to reflect changes in our
                practices or for legal, operational, or regulatory reasons. We will notify you of
                material changes by:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Posting the updated policy on our website</li>
                <li>Updating the &ldquo;Last Updated&rdquo; date</li>
                <li>Sending you an email notification (for significant changes)</li>
                <li>Displaying a prominent notice on our service</li>
              </ul>
              <PageSectionParagraph>
                Your continued use of the service after changes become effective constitutes
                acceptance of the revised Privacy Policy.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="contact" title="13. Contact Us">
              <PageSectionParagraph>
                If you have questions, concerns, or requests regarding this Privacy Policy or our
                data practices, please contact us:
              </PageSectionParagraph>

              <PageSectionParagraph>
                <strong>Privacy Inquiries:</strong>
                <br />
                Email: privacy@fakefour.com
                <br />
                Subject Line: Privacy Inquiry
              </PageSectionParagraph>

              <PageSectionParagraph>
                <strong>Data Protection Officer:</strong>
                <br />
                Email: dpo@fakefour.com
              </PageSectionParagraph>

              <PageSectionParagraph>
                <strong>Mailing Address:</strong>
                <br />
                Fake Four Inc.
                <br />
                Attn: Privacy Department
                <br />
                New Haven, Connecticut
              </PageSectionParagraph>

              <PageSectionParagraph>
                <strong>General Support:</strong>
                <br />
                Email: support@fakefour.com
              </PageSectionParagraph>

              <PageSectionParagraph>
                We will respond to all privacy inquiries within 30 days.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="summary" title="Summary: Our Privacy Promise">
              <ul className="list-inside space-y-2 text-zinc-700">
                <li>
                  <strong>We don&apos;t sell your data.</strong> Your information is never sold,
                  rented, or shared for marketing purposes.
                </li>
                <li>
                  <strong>We use your data to enhance your experience.</strong> Listening history
                  helps us recommend music you&apos;ll love.
                </li>
                <li>
                  <strong>We keep your data secure.</strong> Industry-standard encryption and
                  security practices protect your information.
                </li>
                <li>
                  <strong>You&apos;re in control.</strong> Access, download, or delete your data at
                  any time.
                </li>
                <li>
                  <strong>We&apos;re transparent.</strong> This policy explains exactly what we do
                  with your information.
                </li>
              </ul>
              <PageSectionParagraph>
                Thank you for trusting us with your music experience. Your privacy matters to us.
              </PageSectionParagraph>
            </PageSection>

            <PageSectionParagraph className="text-sm italic">
              This Privacy Policy was last updated on November 4, 2025 and is effective immediately.
            </PageSectionParagraph>
          </CardContent>
        </Card>
      </ContentContainer>
    </PageContainer>
  );
}
