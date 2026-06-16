/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface ChatMentionEntry {
  authorUsername: string;
  body: string;
  createdAt: string;
}

interface ChatMentionEmailData {
  recipientUsername: string;
  mentions: ChatMentionEntry[];
  signInUrl: string;
}

const truncate = (text: string, max = 280): string => {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toUTCString();
};

export const buildChatMentionEmailText = (data: ChatMentionEmailData): string => {
  const isDigest = data.mentions.length > 1;
  const heading = isDigest
    ? `FAKE FOUR INC. — ${data.mentions.length} CHAT MENTIONS`
    : 'FAKE FOUR INC. — CHAT MENTION';

  const sections = data.mentions
    .map((m) => {
      const stamp = formatTimestamp(m.createdAt);
      return `${m.authorUsername}${stamp ? ` — ${stamp}` : ''}:\n${truncate(m.body)}`;
    })
    .join('\n\n');

  const intro = isDigest
    ? `Hi ${data.recipientUsername},\n\nYou were mentioned ${data.mentions.length} times in Fake Four Inc. chat.`
    : `Hi ${data.recipientUsername},\n\n${data.mentions[0]?.authorUsername ?? 'Someone'} mentioned you in Fake Four Inc. chat.`;

  return `${heading}
==============================

${intro}

Messages:
--------
${sections}

Open the chat:
${data.signInUrl}

--
Fake Four Inc. — fakefourrecords.com`;
};
