/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MAX_SUBMISSION_LINKS,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  SUBMISSION_TITLE_MAX,
} from '@/lib/constants/submissions';

import {
  approveSubmissionInputSchema,
  managerUsernameInputSchema,
  rejectSubmissionInputSchema,
  saveSubmissionInputSchema,
  setSubmissionListedInputSchema,
  submissionIdInputSchema,
} from './submission-schema';

const ID = '507f1f77bcf86cd799439011';
const LOADED_AT = '2026-11-11T12:00:00.000Z';

const validSave = {
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>Written on the bus.</p>',
  writingHtml: '<p>A poem.</p>',
  links: ['https://example.com/zine'],
  listed: false,
  acceptAgreement: true,
  turnstileToken: 'token',
};

const issuePaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map(({ path }) => path.join('.')) ?? [];

describe('saveSubmissionInputSchema', () => {
  it('accepts a complete new submission', () => {
    expect(saveSubmissionInputSchema.safeParse(validSave).success).toBe(true);
  });

  it('accepts an edit that names the submission', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, submissionId: ID });

    expect(result.success && result.data.submissionId).toBe(ID);
  });

  it('trims the title', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, title: '  Bus poem  ' });

    expect(result.success && result.data.title).toBe('Bus poem');
  });

  it('accepts an empty title, which a draft may have', () => {
    expect(saveSubmissionInputSchema.safeParse({ ...validSave, title: '' }).success).toBe(true);
  });

  it('refuses a title past the limit', () => {
    const result = saveSubmissionInputSchema.safeParse({
      ...validSave,
      title: 'a'.repeat(SUBMISSION_TITLE_MAX + 1),
    });

    expect(issuePaths(result)).toEqual(['title']);
  });

  it('refuses a category that does not exist', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, category: 'PODCAST' });

    expect(issuePaths(result)).toEqual(['category']);
  });

  it.each([
    ['a javascript: link', 'javascript:alert(1)'],
    ['a data: link', 'data:text/html,hi'],
    ['a relative link', '/admin'],
    ['a mailto: link', 'mailto:someone@example.com'],
  ])('refuses %s', (_name, link) => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, links: [link] });

    expect(issuePaths(result)).toEqual(['links.0']);
  });

  it('refuses more links than the limit', () => {
    const links = Array.from(
      { length: MAX_SUBMISSION_LINKS + 1 },
      (_, index) => `https://example.com/${index}`
    );
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, links });

    expect(issuePaths(result)).toEqual(['links']);
  });

  it('trims each link', () => {
    const result = saveSubmissionInputSchema.safeParse({
      ...validSave,
      links: ['  https://example.com/zine  '],
    });

    expect(result.success && result.data.links).toEqual(['https://example.com/zine']);
  });

  it('refuses a missing verification token', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, turnstileToken: '' });

    expect(issuePaths(result)).toEqual(['turnstileToken']);
  });

  it('refuses a submission id that is not an ObjectId', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, submissionId: 'nope' });

    expect(issuePaths(result)).toEqual(['submissionId']);
  });

  it('refuses a listed value that is not a boolean', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, listed: 'yes' });

    expect(issuePaths(result)).toEqual(['listed']);
  });

  it('drops a field it does not know', () => {
    const result = saveSubmissionInputSchema.safeParse({ ...validSave, status: 'APPROVED' });

    expect(result.success && 'status' in result.data).toBe(false);
  });
});

describe('setSubmissionListedInputSchema', () => {
  it('accepts an id and a boolean', () => {
    expect(
      setSubmissionListedInputSchema.safeParse({ submissionId: ID, listed: true }).success
    ).toBe(true);
  });

  it('refuses a missing listed value', () => {
    expect(issuePaths(setSubmissionListedInputSchema.safeParse({ submissionId: ID }))).toEqual([
      'listed',
    ]);
  });
});

describe('submissionIdInputSchema', () => {
  it('accepts an ObjectId', () => {
    expect(submissionIdInputSchema.safeParse({ submissionId: ID }).success).toBe(true);
  });

  it('refuses anything else', () => {
    expect(issuePaths(submissionIdInputSchema.safeParse({ submissionId: '1' }))).toEqual([
      'submissionId',
    ]);
  });
});

describe('approveSubmissionInputSchema', () => {
  it('accepts an id and the moment the approver loaded it', () => {
    expect(
      approveSubmissionInputSchema.safeParse({ submissionId: ID, loadedUpdatedAt: LOADED_AT })
        .success
    ).toBe(true);
  });

  it('refuses a loaded moment that is not an ISO datetime', () => {
    const result = approveSubmissionInputSchema.safeParse({
      submissionId: ID,
      loadedUpdatedAt: 'yesterday',
    });

    expect(issuePaths(result)).toEqual(['loadedUpdatedAt']);
  });
});

describe('rejectSubmissionInputSchema', () => {
  const valid = { submissionId: ID, loadedUpdatedAt: LOADED_AT, reason: 'Not your recording.' };

  it('accepts a reason within the limits', () => {
    expect(rejectSubmissionInputSchema.safeParse(valid).success).toBe(true);
  });

  it('trims the reason before measuring it', () => {
    const result = rejectSubmissionInputSchema.safeParse({
      ...valid,
      reason: `  ${'a'.repeat(REJECTION_REASON_MIN - 1)}  `,
    });

    expect(issuePaths(result)).toEqual(['reason']);
  });

  it('refuses a missing reason', () => {
    const { reason: _reason, ...withoutReason } = valid;

    expect(issuePaths(rejectSubmissionInputSchema.safeParse(withoutReason))).toEqual(['reason']);
  });

  it('refuses a reason past the limit', () => {
    const result = rejectSubmissionInputSchema.safeParse({
      ...valid,
      reason: 'a'.repeat(REJECTION_REASON_MAX + 1),
    });

    expect(issuePaths(result)).toEqual(['reason']);
  });
});

describe('managerUsernameInputSchema', () => {
  it('accepts a username and trims it', () => {
    const result = managerUsernameInputSchema.safeParse({ username: ' street_team-1 ' });

    expect(result.success && result.data.username).toBe('street_team-1');
  });

  it('refuses characters a username cannot hold', () => {
    expect(issuePaths(managerUsernameInputSchema.safeParse({ username: 'not a name!' }))).toEqual([
      'username',
    ]);
  });
});
