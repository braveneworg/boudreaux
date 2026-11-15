/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SubmissionView } from '@/lib/types/domain/submission';

import { submissionViewPayloadSchema, toSubmissionViewPayload } from './submission-view-schema';

const ID = 'c'.repeat(24);

const view: SubmissionView = {
  id: ID,
  ownerId: 'a'.repeat(24),
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>About</p>',
  writingHtml: '<p>Poem</p>',
  links: ['https://example.com'],
  listed: true,
  status: 'APPROVED',
  rejectionReason: null,
  publishedAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  owner: { username: 'ada', gravatarHash: 'f'.repeat(64) },
  viewer: 'public',
  isPublic: true,
  queuePosition: null,
  attachments: [
    {
      id: 'd'.repeat(24),
      kind: 'IMAGE',
      fileName: 'show.png',
      state: 'ready',
      error: null,
      progress: null,
      url: 'https://cdn.example/copy.jpg',
      cardUrl: 'https://cdn.example/card.webp',
      posterUrl: null,
      width: 1200,
      height: 800,
      durationSeconds: null,
    },
  ],
};

describe('toSubmissionViewPayload', () => {
  it('keeps what the submission modal shows', () => {
    expect(toSubmissionViewPayload(view)).toEqual({
      id: ID,
      title: 'Bus poem',
      category: 'WRITING',
      aboutHtml: '<p>About</p>',
      writingHtml: '<p>Poem</p>',
      links: ['https://example.com'],
      listed: true,
      status: 'APPROVED',
      rejectionReason: null,
      owner: { username: 'ada', gravatarHash: 'f'.repeat(64) },
      viewer: 'public',
      isPublic: true,
      queuePosition: null,
      attachments: view.attachments,
    });
  });

  it('leaves out the owner’s id and the dates, which no screen reads', () => {
    const payload = toSubmissionViewPayload(view);

    expect(Object.keys(payload)).not.toEqual(
      expect.arrayContaining(['ownerId', 'publishedAt', 'updatedAt'])
    );
  });
});

describe('submissionViewPayloadSchema', () => {
  it('accepts a payload as the route sends it', () => {
    const wire: unknown = JSON.parse(JSON.stringify(toSubmissionViewPayload(view)));

    expect(submissionViewPayloadSchema.parse(wire)).toEqual(toSubmissionViewPayload(view));
  });

  it('drops a field the modal has no use for', () => {
    const wire = { ...toSubmissionViewPayload(view), ownerId: 'a'.repeat(24) };

    expect(submissionViewPayloadSchema.parse(wire)).not.toHaveProperty('ownerId');
  });

  it.each([
    ['a viewer kind that does not exist', { viewer: 'stranger' }],
    ['a status that does not exist', { status: 'LIVE' }],
    ['links that are not text', { links: [1] }],
    ['an attachment missing its state', { attachments: [{ id: 'd'.repeat(24) }] }],
  ])('refuses %s', (_name, override) => {
    const wire = { ...toSubmissionViewPayload(view), ...override };

    expect(submissionViewPayloadSchema.safeParse(wire).success).toBe(false);
  });
});
