/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface ChatMentionEmailData {
  recipientUsername: string;
  authorUsername: string;
  messageBody: string;
  signInUrl: string;
}

function truncate(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function buildChatMentionEmailText(data: ChatMentionEmailData): string {
  return `FAKE FOUR INC. — CHAT MENTION
==============================

Hi ${data.recipientUsername},

${data.authorUsername} mentioned you in Fake Four Inc. chat.

Message:
--------
${truncate(data.messageBody)}

Open the chat:
${data.signInUrl}

--
Fake Four Inc. — fakefourrecords.com`;
}
