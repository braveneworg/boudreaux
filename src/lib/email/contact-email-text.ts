/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface ContactEmailData {
  reason: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message: string;
  timestamp: string;
}

export function buildContactEmailText(data: ContactEmailData): string {
  return `CONTACT FORM SUBMISSION
=======================

Reason: ${data.reason}

From: ${data.firstName} ${data.lastName}
Email: ${data.email}
Phone: ${data.phone || 'Not provided'}

Message:
--------
${data.message}

--------
Sent via fakefourrecords.com contact form
${data.timestamp}`;
}
