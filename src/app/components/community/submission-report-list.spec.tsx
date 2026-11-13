/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import type { SubmissionReportView } from '@/lib/types/domain/submission-report';

import { SubmissionReportList } from './submission-report-list';

vi.mock('./submission-report-handle-button', () => ({
  SubmissionReportHandleButton: ({ reportId }: { reportId: string }) => (
    <button type="button" data-testid="handle" data-id={reportId}>
      Mark handled
    </button>
  ),
}));

const ID = 'e'.repeat(24);
const FILED = new Date('2026-11-10T23:30:00.000Z');
const HANDLED = new Date('2026-11-12T09:00:00.000Z');

const report = (overrides: Partial<SubmissionReportView> = {}): SubmissionReportView => ({
  id: ID,
  reason: 'NOT_THEIRS',
  note: 'That is my photo.',
  createdAt: FILED,
  handled: false,
  handledAt: null,
  handledByUsername: null,
  hasContact: false,
  contactEmail: null,
  ...overrides,
});

const handled = (overrides: Partial<SubmissionReportView> = {}): SubmissionReportView =>
  report({ handled: true, handledAt: HANDLED, handledByUsername: 'boss', ...overrides });

const items = (): HTMLElement[] =>
  within(screen.getByRole('list', { name: 'Reports' })).getAllByRole('listitem');

describe('SubmissionReportList', () => {
  it('heads the section and says how many reports are open', () => {
    render(
      <SubmissionReportList
        reports={[report(), report({ id: 'f'.repeat(24) }), handled({ id: 'd'.repeat(24) })]}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('2 open, 1 handled.')).toBeInTheDocument();
  });

  it('says a report takes nothing down by itself', () => {
    render(<SubmissionReportList reports={[report()]} />);

    expect(
      screen.getByText(/A report changes nothing by itself\. Reject the submission/)
    ).toBeInTheDocument();
  });

  it.each([
    ['HARMFUL', 'Reported as harmful'],
    ['NOT_THEIRS', 'Reported as not theirs to post'],
    ['OTHER', 'Reported as something else'],
  ] as const)('names the reason %s', (reason, phrase) => {
    render(<SubmissionReportList reports={[report({ reason })]} />);

    expect(items()[0]).toHaveTextContent(phrase);
  });

  it('dates each report in UTC, whatever the reader’s clock', () => {
    render(<SubmissionReportList reports={[report()]} />);

    expect(items()[0]).toHaveTextContent('Filed Nov 10, 2026');
  });

  it('shows the note as the text it is, never as markup', () => {
    render(
      <SubmissionReportList reports={[report({ note: '<img src=x onerror=alert(1)> mine' })]} />
    );

    expect(screen.getByText('<img src=x onerror=alert(1)> mine')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('says so when no note was left', () => {
    render(<SubmissionReportList reports={[report({ note: '' })]} />);

    expect(items()[0]).toHaveTextContent('No note was left.');
  });

  it('gives an admin the contact email as a mail link', () => {
    render(
      <SubmissionReportList
        reports={[report({ hasContact: true, contactEmail: 'wronged@example.com' })]}
      />
    );

    expect(screen.getByRole('link', { name: 'wronged@example.com' })).toHaveAttribute(
      'href',
      'mailto:wronged@example.com'
    );
  });

  it('keeps an address from adding fields to the admin’s mail draft', () => {
    // A valid address may hold `?`, `&` and `=` before its `@`.
    const contactEmail = 'x?cc=a&subject=s@example.com';
    render(<SubmissionReportList reports={[report({ hasContact: true, contactEmail })]} />);

    expect(screen.getByRole('link', { name: contactEmail })).toHaveAttribute(
      'href',
      'mailto:x%3Fcc%3Da%26subject%3Ds@example.com'
    );
  });

  it('tells a manager a contact was left, without the address', () => {
    render(<SubmissionReportList reports={[report({ hasContact: true, contactEmail: null })]} />);

    expect(items()[0]).toHaveTextContent('A contact email was left. Ask an admin to reply.');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says nothing of a contact when none is held', () => {
    render(<SubmissionReportList reports={[report()]} />);

    expect(items()[0]).not.toHaveTextContent(/contact/i);
  });

  it('offers to mark an open report handled', () => {
    render(<SubmissionReportList reports={[report()]} />);

    expect(within(items()[0] as HTMLElement).getByTestId('handle')).toHaveAttribute('data-id', ID);
  });

  it('says who handled a report and when, and offers nothing more', () => {
    render(<SubmissionReportList reports={[handled()]} />);

    expect(items()[0]).toHaveTextContent('Handled Nov 12, 2026 by boss');
    expect(screen.queryByTestId('handle')).toBeNull();
  });

  it('says only when, for an approver who no longer has a username', () => {
    render(<SubmissionReportList reports={[handled({ handledByUsername: null })]} />);

    expect(items()[0]).toHaveTextContent(/Handled Nov 12, 2026$/);
  });

  it('keeps the order it was given: open first', () => {
    render(
      <SubmissionReportList
        reports={[report({ note: 'open one' }), handled({ id: 'd'.repeat(24), note: 'old one' })]}
      />
    );

    expect(items().map((item) => item.textContent?.includes('open one'))).toEqual([true, false]);
  });
});
