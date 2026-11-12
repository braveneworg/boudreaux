/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  publishSubmissionAction,
  saveSubmissionDraftAction,
} from '@/lib/actions/submission-actions';
import { MAX_SUBMISSION_LINKS, UPLOAD_AGREEMENT_WORDING } from '@/lib/constants/submissions';

import { SubmissionForm, type SubmissionFormProps } from './submission-form';

const { mockToast, mockRouter } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@/lib/actions/submission-actions', () => ({
  publishSubmissionAction: vi.fn(),
  saveSubmissionDraftAction: vi.fn(),
}));

// The real editor is Tiptap, covered by its own spec. Here a textarea stands
// in so the form's wiring is what is under test.
vi.mock('./submission-text-editor', () => ({
  SubmissionTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string) => void;
    ariaLabel: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

// A widget the test passes by hand, so "not verified yet" can be observed.
vi.mock('@/app/components/ui/turnstile-widget', () => ({
  TurnstileWidget: ({
    setIsVerified,
    onToken,
  }: {
    setIsVerified: (verified: boolean) => void;
    onToken?: (token: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        setIsVerified(true);
        onToken?.('token');
      }}
    >
      Pass verification
    </button>
  ),
}));

const ID = 'c'.repeat(24);

const saved = (
  status: 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED',
  queuePosition: number | null = null
) => ({
  success: true as const,
  data: { id: ID, status, listed: false, queuePosition },
});

const approved: SubmissionFormProps['submission'] = {
  id: ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>about</p>',
  writingHtml: '<p>poem</p>',
  links: ['https://example.com/zine'],
  listed: false,
  status: 'APPROVED',
};

const renderForm = (props: Partial<SubmissionFormProps> = {}) =>
  render(<SubmissionForm needsAgreement={false} {...props} />);

const verify = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Pass verification' }));
};

const fillTitle = async (title: string): Promise<void> => {
  const input = screen.getByLabelText('Title');
  await userEvent.clear(input);
  await userEvent.type(input, title);
};

const saveDraft = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
};

const saveChanges = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
};

const publish = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
};

describe('SubmissionForm', () => {
  describe('what it shows', () => {
    it('starts empty, unlisted, in the writings category', () => {
      renderForm();

      expect(screen.getByLabelText('Title')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent(
        'Writings (lyrics, poetry, prose, and blurbs)'
      );
      expect(
        screen.getByRole('switch', { name: 'Show on the User Submitted Content page' })
      ).not.toBeChecked();
      expect(screen.getByText('Off: only people with the link can open it.')).toBeInTheDocument();
    });

    it('says what saving and publishing each do, beside the buttons', () => {
      renderForm();

      expect(
        screen.getByText(
          'Saving keeps a draft only you can see. Publishing sends it to our team for approval; nobody else can open it until it is approved.'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'By publishing you confirm this is yours to share and follows the community rules.'
        )
      ).toBeInTheDocument();
    });

    it('asks for the upload agreement only when the account still owes it', () => {
      const { unmount } = renderForm({ needsAgreement: true });
      expect(screen.getByRole('switch', { name: UPLOAD_AGREEMENT_WORDING })).not.toBeChecked();
      unmount();

      renderForm({ needsAgreement: false });
      expect(
        screen.queryByRole('switch', { name: UPLOAD_AGREEMENT_WORDING })
      ).not.toBeInTheDocument();
    });

    it('loads the submission it is given', () => {
      renderForm({ submission: approved });

      expect(screen.getByLabelText('Title')).toHaveValue('Bus poem');
      expect(screen.getByLabelText('About')).toHaveValue('<p>about</p>');
      expect(screen.getByLabelText('Writing')).toHaveValue('<p>poem</p>');
      expect(screen.getByLabelText('Link 1')).toHaveValue('https://example.com/zine');
    });

    it('keeps both buttons off until verification has passed', async () => {
      renderForm();

      expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();

      await verify();

      expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
    });
  });

  describe('links', () => {
    it('adds a row per link and stops offering more at the limit', async () => {
      renderForm();

      for (let index = 0; index < MAX_SUBMISSION_LINKS; index++) {
        await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
      }

      expect(screen.getAllByRole('textbox', { name: /^Link \d+$/ })).toHaveLength(
        MAX_SUBMISSION_LINKS
      );
      expect(screen.getByRole('button', { name: 'Add a link' })).toBeDisabled();
    });

    it('removes a row', async () => {
      renderForm({ submission: approved });

      await userEvent.click(screen.getByRole('button', { name: 'Remove link 1' }));

      expect(screen.queryByLabelText('Link 1')).not.toBeInTheDocument();
    });

    it('refuses a link that is not an http(s) address, on its row, without calling the server', async () => {
      renderForm();
      await verify();
      await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
      await userEvent.type(screen.getByLabelText('Link 1'), 'not a link');

      await saveDraft();

      expect(await screen.findByText('Must be an http(s) URL')).toBeInTheDocument();
      expect(saveSubmissionDraftAction).not.toHaveBeenCalled();
    });
  });

  describe('saving a draft', () => {
    it('sends the form with the token, links as plain addresses', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce(saved('DRAFT'));
      renderForm({ needsAgreement: true });
      await verify();
      await fillTitle('Bus poem');
      await userEvent.type(screen.getByLabelText('Writing'), '<p>A poem.</p>');
      await userEvent.click(screen.getByRole('switch', { name: UPLOAD_AGREEMENT_WORDING }));
      await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
      await userEvent.type(screen.getByLabelText('Link 1'), 'https://example.com/zine');

      await saveDraft();

      await waitFor(() =>
        expect(vi.mocked(saveSubmissionDraftAction).mock.calls).toEqual([
          [
            {
              title: 'Bus poem',
              category: 'WRITING',
              aboutHtml: '',
              writingHtml: '<p>A poem.</p>',
              links: ['https://example.com/zine'],
              listed: false,
              acceptAgreement: true,
              turnstileToken: 'token',
            },
          ],
        ])
      );
      expect(publishSubmissionAction).not.toHaveBeenCalled();
    });

    it('moves a new draft to its own edit address and says it was saved', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce(saved('DRAFT'));
      renderForm();
      await verify();

      await saveDraft();

      await waitFor(() =>
        expect(mockRouter.replace.mock.calls).toEqual([[`/community/${ID}/edit`]])
      );
      expect(mockToast.success.mock.calls).toEqual([['Draft saved. Only you can see it.']]);
    });

    it('names the submission it is editing', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce(saved('DRAFT'));
      renderForm({ submission: { ...approved, status: 'DRAFT' } });
      await verify();

      await saveDraft();

      await waitFor(() =>
        expect(vi.mocked(saveSubmissionDraftAction).mock.calls[0]?.[0]).toMatchObject({
          submissionId: ID,
        })
      );
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('shows a rule the server raised on the field it names', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce({
        success: false,
        error: 'Keep the about to 1,000 characters or fewer.',
        code: 'VALIDATION',
        fieldErrors: { aboutHtml: ['Keep the about to 1,000 characters or fewer.'] },
      });
      renderForm();
      await verify();

      await saveDraft();

      expect(
        await screen.findByText('Keep the about to 1,000 characters or fewer.')
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows a failure with no field above the buttons', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce({
        success: false,
        error: 'You can have 5 submissions that are not approved yet.',
        code: 'LIMIT_EXCEEDED',
      });
      renderForm();
      await verify();

      await saveDraft();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You can have 5 submissions that are not approved yet.'
      );
    });

    it('asks for verification again after every round trip', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce({
        success: false,
        error: 'Something failed.',
        code: 'UNKNOWN',
      });
      renderForm();
      await verify();

      await saveDraft();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
      );
    });
  });

  describe('publishing', () => {
    it('sends the form to the publish action', async () => {
      vi.mocked(publishSubmissionAction).mockResolvedValueOnce(saved('AWAITING_APPROVAL', 2));
      renderForm();
      await verify();
      await fillTitle('Bus poem');

      await publish();

      await waitFor(() => expect(publishSubmissionAction).toHaveBeenCalledTimes(1));
      expect(saveSubmissionDraftAction).not.toHaveBeenCalled();
    });

    it('replaces the form with the queue position and what happens next', async () => {
      vi.mocked(publishSubmissionAction).mockResolvedValueOnce(saved('AWAITING_APPROVAL', 2));
      renderForm();
      await verify();

      await publish();

      const sent = await screen.findByRole('status');
      expect(sent).toHaveTextContent('Sent for approval.');
      expect(sent).toHaveTextContent(
        '2 submissions are ahead of yours. We usually reply within 2 to 5 business days.'
      );
      expect(sent).toHaveTextContent("We'll email you when it's live or if we need changes.");
      expect(within(sent).getByRole('link', { name: 'View your submission' })).toHaveAttribute(
        'href',
        `/community/${ID}`
      );
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('says next in line when none are ahead', async () => {
      vi.mocked(publishSubmissionAction).mockResolvedValueOnce(saved('AWAITING_APPROVAL', 0));
      renderForm();
      await verify();

      await publish();

      expect(await screen.findByRole('status')).toHaveTextContent(
        "You're next in line for approval."
      );
    });

    it('shows a publish rule on its field and keeps the form', async () => {
      vi.mocked(publishSubmissionAction).mockResolvedValueOnce({
        success: false,
        error: 'Add a title before publishing.',
        code: 'VALIDATION',
        fieldErrors: { title: ['Add a title before publishing.'] },
      });
      renderForm();
      await verify();

      await publish();

      expect(await screen.findByText('Add a title before publishing.')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
    });
  });

  describe('editing an approved submission', () => {
    it('warns that a content edit takes it offline, and saves only on confirm', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce(saved('AWAITING_APPROVAL', 0));
      renderForm({ submission: approved });
      await verify();
      await fillTitle('Typo fixed');

      await saveChanges();

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('Editing takes this offline until it is approved again.');
      expect(saveSubmissionDraftAction).not.toHaveBeenCalled();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Save and send for approval' })
      );

      await waitFor(() => expect(saveSubmissionDraftAction).toHaveBeenCalledTimes(1));
    });

    it('saves nothing when the owner backs out of the warning', async () => {
      renderForm({ submission: approved });
      await verify();
      await fillTitle('Typo fixed');

      await saveChanges();
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it as it is' }));

      expect(saveSubmissionDraftAction).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Title')).toHaveValue('Typo fixed');
    });

    it('does not warn when only the listed choice changed', async () => {
      vi.mocked(saveSubmissionDraftAction).mockResolvedValueOnce(saved('APPROVED'));
      renderForm({ submission: approved });
      await verify();
      await userEvent.click(
        screen.getByRole('switch', { name: 'Show on the User Submitted Content page' })
      );

      await saveChanges();

      await waitFor(() => expect(saveSubmissionDraftAction).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('offers no Publish button, since saving an edit is what sends it for approval', () => {
      renderForm({ submission: approved });

      expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    });
  });
});
