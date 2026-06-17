/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

interface AbuseReportEmailData {
  recipientUsername: string;
  reportedUsername: string;
  moderationUrl: string;
}

export const buildAbuseReportEmailText = (
  data: AbuseReportEmailData
): string => `FAKE FOUR INC. — ABUSE REPORT
==============================

Hi ${data.recipientUsername},

A community member has submitted an abuse report against @${data.reportedUsername}.

Reporter identity is intentionally withheld. Open the moderation view to review the user's recent messages:

${data.moderationUrl}

--
Fake Four Inc. — fakefourrecords.com`;
