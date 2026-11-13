/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { REPORT_NOTE_MAX, REPORT_OTHER_NOTE_MIN } from '@/lib/constants/submissions';

import {
  fileSubmissionReportInputSchema,
  submissionReportFormSchema,
  submissionReportIdInputSchema,
} from './submission-report-schema';

const ID = '507f1f77bcf86cd799439011';

const validReport = {
  submissionId: ID,
  reason: 'HARMFUL',
  note: '',
  contactEmail: '',
  turnstileToken: 'token',
};

const issuePaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map(({ path }) => path.join('.')) ?? [];

describe('fileSubmissionReportInputSchema', () => {
  it('accepts a reason alone', () => {
    expect(fileSubmissionReportInputSchema.safeParse(validReport).success).toBe(true);
  });

  it.each(['HARMFUL', 'NOT_THEIRS', 'OTHER'])('accepts the reason %s', (reason) => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      reason,
      note: 'It shows my house number.',
    });

    expect(result.success).toBe(true);
  });

  it('refuses a report with no reason', () => {
    const { reason: _reason, ...withoutReason } = validReport;

    expect(issuePaths(fileSubmissionReportInputSchema.safeParse(withoutReason))).toEqual([
      'reason',
    ]);
  });

  it('refuses a reason that is not one of the three', () => {
    const result = fileSubmissionReportInputSchema.safeParse({ ...validReport, reason: 'SPAM' });

    expect(issuePaths(result)).toEqual(['reason']);
  });

  it('trims the note', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      note: '  That is my photo.  ',
    });

    expect(result.success && result.data.note).toBe('That is my photo.');
  });

  it('accepts a note at the limit', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      note: 'a'.repeat(REPORT_NOTE_MAX),
    });

    expect(result.success).toBe(true);
  });

  it('refuses a note past the limit', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      note: 'a'.repeat(REPORT_NOTE_MAX + 1),
    });

    expect(issuePaths(result)).toEqual(['note']);
  });

  it('refuses the reason "other" without a note that says what is wrong', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      reason: 'OTHER',
      note: 'a'.repeat(REPORT_OTHER_NOTE_MIN - 1),
    });

    expect(issuePaths(result)).toEqual(['note']);
  });

  it('accepts the reason "other" with a note of the shortest length', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      reason: 'OTHER',
      note: 'a'.repeat(REPORT_OTHER_NOTE_MIN),
    });

    expect(result.success).toBe(true);
  });

  it('reads an empty contact email as none left', () => {
    const result = fileSubmissionReportInputSchema.safeParse({ ...validReport, contactEmail: ' ' });

    expect(result.success && result.data.contactEmail).toBeNull();
  });

  it('reads a missing contact email as none left', () => {
    const { contactEmail: _contactEmail, ...withoutContact } = validReport;
    const result = fileSubmissionReportInputSchema.safeParse(withoutContact);

    expect(result.success && result.data.contactEmail).toBeNull();
  });

  it('trims and lower-cases a contact email', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      contactEmail: '  Wronged@Example.COM ',
    });

    expect(result.success && result.data.contactEmail).toBe('wronged@example.com');
  });

  it.each(['not-an-email', 'two@@example.com', 'a@b', `${'a'.repeat(250)}@example.com`])(
    'refuses the contact email %s',
    (contactEmail) => {
      const result = fileSubmissionReportInputSchema.safeParse({ ...validReport, contactEmail });

      expect(issuePaths(result)).toEqual(['contactEmail']);
    }
  );

  it('refuses an id that is not a submission id', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      submissionId: 'nope',
    });

    expect(issuePaths(result)).toEqual(['submissionId']);
  });

  it('refuses a report without a verification token', () => {
    const result = fileSubmissionReportInputSchema.safeParse({
      ...validReport,
      turnstileToken: '',
    });

    expect(issuePaths(result)).toEqual(['turnstileToken']);
  });
});

describe('submissionReportFormSchema', () => {
  const validForm = { reason: 'NOT_THEIRS', note: '', contactEmail: '' };

  it('accepts what the dialog holds: no id and no token', () => {
    expect(submissionReportFormSchema.safeParse(validForm).success).toBe(true);
  });

  it('keeps the contact email as the text the field holds', () => {
    const result = submissionReportFormSchema.safeParse({
      ...validForm,
      contactEmail: 'me@example.com',
    });

    expect(result.success && result.data.contactEmail).toBe('me@example.com');
  });

  it('refuses a form with no reason chosen', () => {
    const result = submissionReportFormSchema.safeParse({ ...validForm, reason: '' });

    expect(issuePaths(result)).toEqual(['reason']);
  });

  it('holds "other" to the same note rule as the server', () => {
    const result = submissionReportFormSchema.safeParse({ ...validForm, reason: 'OTHER' });

    expect(issuePaths(result)).toEqual(['note']);
  });

  it('refuses a malformed contact email on its field', () => {
    const result = submissionReportFormSchema.safeParse({ ...validForm, contactEmail: 'nope' });

    expect(issuePaths(result)).toEqual(['contactEmail']);
  });
});

describe('submissionReportIdInputSchema', () => {
  it('accepts a report id', () => {
    expect(submissionReportIdInputSchema.safeParse({ reportId: ID }).success).toBe(true);
  });

  it('refuses anything else', () => {
    expect(submissionReportIdInputSchema.safeParse({ reportId: 'nope' }).success).toBe(false);
  });
});
