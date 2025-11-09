import Link from 'next/link';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Card, CardContent } from '@/app/components/ui/card';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PageSection } from '@/app/components/ui/page-section';
import { PageSectionParagraph } from '@/app/components/ui/page-section-paragraph';

export default function CookiesPolicyPage() {
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu
          items={[
            { anchorText: 'Legal', url: '/legal', isActive: false },
            { anchorText: 'Cookies Policy', url: '/legal/cookies-policy', isActive: true },
          ]}
        />
        <Card>
          <CardContent>
            <h1 id="cookie-policy">Cookie Policy</h1>
            <PageSectionParagraph>
              <strong>Last Updated: November 4, 2025</strong>
            </PageSectionParagraph>
            <PageSectionParagraph>
              This Cookie Policy explains how Fake Four Inc. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;our&rdquo;) uses cookies and similar tracking technologies on our music
              streaming platform. This policy helps you understand what cookies are, how we use
              them, and your choices regarding their use.
            </PageSectionParagraph>

            <PageSection id="what-are-cookies" title="What Are Cookies?">
              <PageSectionParagraph>
                Cookies are small text files that are placed on your device (computer, smartphone,
                tablet) when you visit a website. They are widely used to make websites work more
                efficiently and provide information to website owners.
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Key characteristics of cookies:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>They contain small amounts of data</li>
                <li>They help websites remember information about your visit</li>
                <li>
                  They can be set by the website you visit (&ldquo;first-party cookies&rdquo;) or by
                  other services (&ldquo;third-party cookies&rdquo;)
                </li>
                <li>
                  They have expiration dates (some expire when you close your browser, others
                  persist longer)
                </li>
              </ul>
            </PageSection>

            <PageSection id="why-we-use-cookies" title="Why We Use Cookies">
              <PageSectionParagraph>We use cookies to:</PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Keep you logged into your account</li>
                <li>Remember your preferences and settings</li>
                <li>Understand how you use our service</li>
                <li>Improve your music listening experience</li>
                <li>Ensure the security of our platform</li>
                <li>Analyze site performance and functionality</li>
                <li>Provide personalized music recommendations</li>
              </ul>
              <PageSectionParagraph>
                <strong>We do not use cookies to:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Track you across other websites for advertising purposes</li>
                <li>Sell your browsing data to third parties</li>
                <li>Create invasive profiles for marketing to other companies</li>
              </ul>
            </PageSection>

            <PageSection id="types-of-cookies" title="Types of Cookies We Use">
              <PageSectionParagraph>
                We categorize cookies based on their purpose and necessity:
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">
                1. Strictly Necessary Cookies (Always Active)
              </h3>
              <PageSectionParagraph>
                These cookies are essential for our website to function properly. They enable core
                functionality such as security, network management, and accessibility. You cannot
                opt-out of these cookies as the website cannot function properly without them.
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Examples:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Authentication cookies:</strong> Keep you logged into your account as you
                  navigate through the platform
                </li>
                <li>
                  <strong>Security cookies:</strong> Detect authentication abuses and protect user
                  data from unauthorized access
                </li>
                <li>
                  <strong>Load balancing cookies:</strong> Distribute traffic across our servers to
                  ensure optimal performance
                </li>
                <li>
                  <strong>Session cookies:</strong> Remember your current session and preferences
                  while you browse
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Cookie Names:</strong> <code>session_id</code>, <code>auth_token</code>,{' '}
                <code>security_token</code>, <code>load_balancer</code>
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Duration:</strong> Session-based (deleted when you close your browser) or up
                to 30 days
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Legal Basis:</strong> These cookies are necessary for the performance of our
                contract with you (providing the service)
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">
                2. Functional Cookies (Opt-in Required)
              </h3>
              <PageSectionParagraph>
                These cookies enable enhanced functionality and personalization. They may be set by
                us or by third-party providers whose services we use. If you do not allow these
                cookies, some or all of these services may not function properly.
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Examples:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Preference cookies:</strong> Remember your settings like volume level,
                  playback quality, language preference, and theme (light/dark mode)
                </li>
                <li>
                  <strong>Playback cookies:</strong> Remember your listening history within a
                  session to enable &ldquo;continue where you left off&rdquo; functionality
                </li>
                <li>
                  <strong>Feature cookies:</strong> Enable interactive features like playlist
                  collaboration and social sharing
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Cookie Names:</strong> <code>user_preferences</code>,{' '}
                <code>playback_state</code>, <code>volume_setting</code>,{' '}
                <code>quality_preference</code>, <code>language</code>, <code>theme_mode</code>
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Duration:</strong> Up to 12 months
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Legal Basis:</strong> Your consent, which you can withdraw at any time
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">
                3. Performance and Analytics Cookies (Opt-in Required)
              </h3>
              <PageSectionParagraph>
                These cookies help us understand how visitors interact with our website by
                collecting and reporting information anonymously. This helps us improve how our
                website works.
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Examples:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Analytics cookies:</strong> Count visits, identify traffic sources, and
                  see which pages are most popular
                </li>
                <li>
                  <strong>Error tracking cookies:</strong> Help us identify and fix technical issues
                </li>
                <li>
                  <strong>A/B testing cookies:</strong> Allow us to test different versions of
                  features to improve user experience
                </li>
                <li>
                  <strong>Performance monitoring cookies:</strong> Measure page load times and
                  streaming quality
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Cookie Names:</strong> <code>_ga</code>, <code>_gid</code>,{' '}
                <code>_gat</code> (Google Analytics), <code>analytics_session</code>,{' '}
                <code>performance_tracking</code>
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Third-party services we use:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Google Analytics:</strong> Helps us understand site usage (we have IP
                  anonymization enabled)
                  <br />
                  Privacy Policy:{' '}
                  <Link href="https://policies.google.com/privacy" className="hover:underline">
                    https://policies.google.com/privacy
                  </Link>
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Duration:</strong> From session-based to up to 24 months
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Legal Basis:</strong> Your consent, which you can withdraw at any time
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Note:</strong> All analytics data is aggregated and anonymized. We cannot
                identify individual users from this data.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">
                4. Targeting and Advertising Cookies (Opt-in Required)
              </h3>
              <PageSectionParagraph>
                These cookies may be set through our site by our advertising partners. They may be
                used to build a profile of your interests and show you relevant advertisements on
                other sites.
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Our Approach:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>We use minimal advertising cookies and only with your explicit consent</li>
                <li>We do not sell your data to advertisers</li>
                <li>
                  We may show you relevant music recommendations based on your listening history
                </li>
                <li>
                  If we partner with advertising networks, we require them to respect your privacy
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Cookie Names:</strong> <code>ad_preferences</code>,{' '}
                <code>marketing_consent</code>
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Duration:</strong> Up to 12 months
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Legal Basis:</strong> Your explicit consent, which you can withdraw at any
                time
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="similar-technologies" title="Similar Technologies We Use">
              <PageSectionParagraph>
                In addition to cookies, we use similar technologies:
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Local Storage</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Stores data locally on your device to improve performance</li>
                <li>Used to cache album artwork and reduce loading times</li>
                <li>You can clear local storage through your browser settings</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Session Storage</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Temporarily stores data during your browsing session</li>
                <li>Automatically cleared when you close your browser</li>
                <li>Used for temporary playback states and navigation</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Web Beacons (Pixel Tags)</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Small transparent images embedded in emails or web pages</li>
                <li>Help us understand email open rates and user engagement</li>
                <li>Used only with your consent for marketing communications</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Device Fingerprinting</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>We do NOT use device fingerprinting or other covert tracking methods</li>
                <li>We respect your privacy and rely on transparent cookie usage</li>
              </ul>
            </PageSection>

            <PageSection id="cookie-duration-types" title="Cookie Duration Types">
              <h3 className="mb-4 mt-6 text-xl font-semibold">Session Cookies</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Temporary cookies that expire when you close your browser</li>
                <li>Used for essential functions like keeping you logged in during a session</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Persistent Cookies</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Remain on your device for a set period (specified in each cookie category)</li>
                <li>Used to remember your preferences across multiple visits</li>
                <li>You can delete these manually through your browser settings</li>
              </ul>
            </PageSection>

            <PageSection id="cookie-choices" title="Your Cookie Choices and Control">
              <PageSectionParagraph>
                You have several options to control cookies:
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">1. Cookie Consent Manager</h3>
              <PageSectionParagraph>
                When you first visit our site, you&apos;ll see a cookie consent banner. You can:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Accept all cookies</li>
                <li>Reject non-essential cookies</li>
                <li>Customize your preferences by cookie category</li>
                <li>
                  Change your preferences at any time by clicking the &ldquo;Cookie Settings&rdquo;
                  link in the footer
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Important:</strong> If you reject cookies, certain features may not work
                properly, such as:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Staying logged in between sessions</li>
                <li>Remembering your preferences (volume, quality, theme)</li>
                <li>Personalized music recommendations</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">2. Browser Settings</h3>
              <PageSectionParagraph>
                Most web browsers allow you to control cookies through their settings:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Google Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies
                  and other site data
                </li>
                <li>
                  <strong>Mozilla Firefox:</strong> Settings &gt; Privacy &amp; Security &gt;
                  Cookies and Site Data
                </li>
                <li>
                  <strong>Safari:</strong> Preferences &gt; Privacy &gt; Cookies and website data
                </li>
                <li>
                  <strong>Microsoft Edge:</strong> Settings &gt; Cookies and site permissions &gt;
                  Cookies and site data
                </li>
              </ul>
              <PageSectionParagraph>
                <strong>Clearing cookies:</strong> You can delete all cookies stored on your device
                through your browser&apos;s privacy settings. Note that this will log you out and
                reset your preferences.
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">3. Browser Do Not Track (DNT)</h3>
              <PageSectionParagraph>
                Some browsers have a &ldquo;Do Not Track&rdquo; feature. When enabled, we respect
                this signal by:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Not setting optional analytics or advertising cookies</li>
                <li>Limiting data collection to essential functions only</li>
                <li>Ensuring third-party services also respect DNT signals where possible</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">4. Opt-Out of Third-Party Cookies</h3>
              <PageSectionParagraph>
                For third-party cookies (like Google Analytics), you can opt-out directly:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Google Analytics Opt-out:</strong> Install the Google Analytics Opt-out
                  Browser Add-on:{' '}
                  <Link href="https://tools.google.com/dlpage/gaoptout" className="hover:underline">
                    https://tools.google.com/dlpage/gaoptout
                  </Link>
                </li>
                <li>
                  <strong>Your Online Choices (EU):</strong>{' '}
                  <Link href="https://www.youronlinechoices.eu/" className="hover:underline">
                    https://www.youronlinechoices.eu/
                  </Link>
                </li>
                <li>
                  <strong>Network Advertising Initiative:</strong>{' '}
                  <Link
                    href="https://www.networkadvertising.org/choices/"
                    className="hover:underline"
                  >
                    https://www.networkadvertising.org/choices/
                  </Link>
                </li>
                <li>
                  <strong>Digital Advertising Alliance:</strong>{' '}
                  <Link href="https://www.aboutads.info/choices/" className="hover:underline">
                    https://www.aboutads.info/choices/
                  </Link>
                </li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">5. Mobile Device Settings</h3>
              <PageSectionParagraph>For mobile apps (if applicable):</PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>iOS:</strong> Settings &gt; Privacy &gt; Tracking
                </li>
                <li>
                  <strong>Android:</strong> Settings &gt; Privacy &gt; Ads
                </li>
              </ul>
            </PageSection>

            <PageSection id="eu-compliance" title="EU-Specific Rights and Compliance">
              <PageSectionParagraph>
                We comply with the EU General Data Protection Regulation (GDPR) and the ePrivacy
                Directive (Cookie Law).
              </PageSectionParagraph>

              <h3 className="mb-4 mt-6 text-xl font-semibold">Your Rights Under EU Law</h3>
              <PageSectionParagraph>
                <strong>Right to Consent:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>We obtain your explicit consent before setting non-essential cookies</li>
                <li>Consent must be freely given, specific, informed, and unambiguous</li>
                <li>Continued browsing does NOT constitute consent</li>
              </ul>

              <PageSectionParagraph>
                <strong>Right to Withdraw Consent:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>You can withdraw your consent at any time through our Cookie Settings</li>
                <li>Withdrawal is as easy as giving consent</li>
                <li>Withdrawal does not affect the lawfulness of processing before withdrawal</li>
              </ul>

              <PageSectionParagraph>
                <strong>Right to Information:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>This policy provides clear information about what cookies we use and why</li>
                <li>We inform you before cookies are set (via our consent banner)</li>
              </ul>

              <PageSectionParagraph>
                <strong>Right to Access:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  You can see which cookies are currently stored on your device through your browser
                  settings
                </li>
                <li>Contact us to request information about data collected via cookies</li>
              </ul>

              <PageSectionParagraph>
                <strong>Right to Deletion:</strong>
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>You can delete cookies at any time through your browser settings</li>
                <li>You can request deletion of data collected via cookies by contacting us</li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">GDPR Compliance Measures</h3>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>
                  <strong>Consent Management Platform:</strong> We use a compliant cookie consent
                  banner that meets GDPR requirements
                </li>
                <li>
                  <strong>Cookie Audit:</strong> We regularly review and audit all cookies used on
                  our platform
                </li>
                <li>
                  <strong>Data Minimization:</strong> We only collect data that is necessary for
                  specified purposes
                </li>
                <li>
                  <strong>Purpose Limitation:</strong> We only use cookie data for the purposes
                  stated in this policy
                </li>
                <li>
                  <strong>Storage Limitation:</strong> Cookies are automatically deleted after their
                  specified duration
                </li>
                <li>
                  <strong>Transparency:</strong> This policy provides detailed information about all
                  cookies we use
                </li>
                <li>
                  <strong>No Cookie Walls:</strong> We do not deny access to our service if you
                  reject non-essential cookies (though some features may be limited)
                </li>
              </ul>

              <h3 className="mb-4 mt-6 text-xl font-semibold">International Data Transfers</h3>
              <PageSectionParagraph>
                Some of our service providers (like Google Analytics) may transfer cookie data
                outside the EU. We ensure adequate protection through:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Standard Contractual Clauses (SCCs) approved by the EU Commission</li>
                <li>Adequacy decisions for certain countries</li>
                <li>Additional safeguards to protect your data</li>
              </ul>
            </PageSection>

            <PageSection id="cookie-table" title="Specific Cookie Information Table">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-zinc-300">
                  <thead>
                    <tr className="bg-zinc-100">
                      <th className="border border-zinc-300 px-4 py-2 text-left">Cookie Name</th>
                      <th className="border border-zinc-300 px-4 py-2 text-left">Category</th>
                      <th className="border border-zinc-300 px-4 py-2 text-left">Purpose</th>
                      <th className="border border-zinc-300 px-4 py-2 text-left">Duration</th>
                      <th className="border border-zinc-300 px-4 py-2 text-left">Provider</th>
                      <th className="border border-zinc-300 px-4 py-2 text-left">
                        First/Third-Party
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>session_id</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Strictly Necessary</td>
                      <td className="border border-zinc-300 px-4 py-2">Maintains user session</td>
                      <td className="border border-zinc-300 px-4 py-2">Session</td>
                      <td className="border border-zinc-300 px-4 py-2">Us</td>
                      <td className="border border-zinc-300 px-4 py-2">First-party</td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>auth_token</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Strictly Necessary</td>
                      <td className="border border-zinc-300 px-4 py-2">Authentication</td>
                      <td className="border border-zinc-300 px-4 py-2">30 days</td>
                      <td className="border border-zinc-300 px-4 py-2">Us</td>
                      <td className="border border-zinc-300 px-4 py-2">First-party</td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>user_preferences</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Functional</td>
                      <td className="border border-zinc-300 px-4 py-2">Stores user settings</td>
                      <td className="border border-zinc-300 px-4 py-2">12 months</td>
                      <td className="border border-zinc-300 px-4 py-2">Us</td>
                      <td className="border border-zinc-300 px-4 py-2">First-party</td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>playback_state</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Functional</td>
                      <td className="border border-zinc-300 px-4 py-2">
                        Remembers playback position
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">7 days</td>
                      <td className="border border-zinc-300 px-4 py-2">Us</td>
                      <td className="border border-zinc-300 px-4 py-2">First-party</td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>_ga</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Analytics</td>
                      <td className="border border-zinc-300 px-4 py-2">
                        Google Analytics tracking
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">24 months</td>
                      <td className="border border-zinc-300 px-4 py-2">Google</td>
                      <td className="border border-zinc-300 px-4 py-2">Third-party</td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>_gid</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Analytics</td>
                      <td className="border border-zinc-300 px-4 py-2">
                        Google Analytics identification
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">24 hours</td>
                      <td className="border border-zinc-300 px-4 py-2">Google</td>
                      <td className="border border-zinc-300 px-4 py-2">Third-party</td>
                    </tr>
                    <tr>
                      <td className="border border-zinc-300 px-4 py-2">
                        <code>consent_preferences</code>
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">Strictly Necessary</td>
                      <td className="border border-zinc-300 px-4 py-2">
                        Stores cookie consent choices
                      </td>
                      <td className="border border-zinc-300 px-4 py-2">12 months</td>
                      <td className="border border-zinc-300 px-4 py-2">Us</td>
                      <td className="border border-zinc-300 px-4 py-2">First-party</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <PageSectionParagraph className="mt-4">
                <em>
                  This table is regularly updated. For a complete current list, please use your
                  browser&apos;s developer tools or contact us.
                </em>
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="changes" title="Changes to This Cookie Policy">
              <PageSectionParagraph>
                We may update this Cookie Policy to reflect changes in our practices or for legal,
                operational, or regulatory reasons. We will notify you of material changes by:
              </PageSectionParagraph>
              <ul className="list-inside list-disc space-y-2 text-zinc-700">
                <li>Updating the &ldquo;Last Updated&rdquo; date at the top of this policy</li>
                <li>Displaying a notice on our website</li>
                <li>Requesting renewed consent if required by law</li>
              </ul>
              <PageSectionParagraph>
                We encourage you to review this policy periodically.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="contact" title="Contact Us">
              <PageSectionParagraph>
                If you have questions about our use of cookies or this Cookie Policy, please contact
                us:
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Cookie and Privacy Inquiries:</strong>
                <br />
                Email: privacy@fakefour.com
                <br />
                Subject: Cookie Policy Inquiry
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Data Protection Officer (EU):</strong>
                <br />
                Email: dpo@fakefour.com
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Mailing Address:</strong>
                <br />
                Fake Four Inc.
                <br />
                Attn: Data Privacy Department
                <br />
                New Haven, Connecticut
              </PageSectionParagraph>
              <PageSectionParagraph>
                <strong>Cookie Settings:</strong>
                <br />
                Click &ldquo;Cookie Settings&rdquo; in the website footer to manage your preferences
                at any time.
              </PageSectionParagraph>
            </PageSection>

            <PageSection id="summary" title="Quick Summary: How We Use Cookies">
              <ul className="list-inside space-y-2 text-zinc-700">
                <li>✅ Essential cookies keep you logged in and the site working</li>
                <li>✅ Preference cookies remember your settings (with your permission)</li>
                <li>✅ Analytics cookies help us improve the site (with your permission)</li>
                <li>✅ We respect your choices and make it easy to control cookies</li>
                <li>
                  ✅ We don&apos;t sell your data or track you across the internet for advertising
                </li>
                <li>✅ EU residents have full GDPR rights and protections</li>
              </ul>
              <PageSectionParagraph>
                <strong>You&apos;re in control.</strong> Manage your cookie preferences anytime
                through our Cookie Settings.
              </PageSectionParagraph>
            </PageSection>

            <PageSectionParagraph className="text-sm italic">
              This Cookie Policy was last updated on November 4, 2025 and is effective immediately.
            </PageSectionParagraph>
          </CardContent>
        </Card>
      </ContentContainer>
    </PageContainer>
  );
}
