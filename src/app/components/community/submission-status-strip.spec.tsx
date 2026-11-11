/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { SubmissionStatusStrip, type SubmissionStatusStripProps } from './submission-status-strip';

const strip = (
  overrides: Partial<SubmissionStatusStripProps> = {}
): SubmissionStatusStripProps => ({
  status: 'DRAFT',
  viewer: 'owner',
  listed: false,
  isPublic: false,
  rejectionReason: null,
  queuePosition: null,
  ...overrides,
});

const text = (): string => screen.getByRole('status').textContent ?? '';

describe('SubmissionStatusStrip', () => {
  it('shows nothing to a member of the public', () => {
    const { container } = render(
      <SubmissionStatusStrip {...strip({ viewer: 'public', status: 'APPROVED', isPublic: true })} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('tells the owner a draft is theirs alone', () => {
    render(<SubmissionStatusStrip {...strip()} />);

    expect(text()).toBe('Draft. Only you can see this.');
  });

  it('tells the owner their place in the queue while it awaits approval', () => {
    render(<SubmissionStatusStrip {...strip({ status: 'AWAITING_APPROVAL', queuePosition: 2 })} />);

    expect(text()).toBe(
      'Awaiting approval. 2 submissions are ahead of yours. We usually reply within 2 to 5 business days.'
    );
  });

  it('tells the owner they are next when none are ahead', () => {
    render(<SubmissionStatusStrip {...strip({ status: 'AWAITING_APPROVAL', queuePosition: 0 })} />);

    expect(text()).toContain("You're next in line for approval.");
  });

  it('gives an approver the state with no queue position', () => {
    render(
      <SubmissionStatusStrip {...strip({ status: 'AWAITING_APPROVAL', viewer: 'approver' })} />
    );

    expect(text()).toBe('Awaiting approval. Nobody else can open it yet.');
  });

  it('shows the owner why it was rejected and what to do', () => {
    render(
      <SubmissionStatusStrip
        {...strip({ status: 'REJECTED', rejectionReason: 'Not your recording.' })}
      />
    );

    expect(text()).toBe(
      'Not approved, so it is offline. Reason: Not your recording. Edit it and publish again.'
    );
  });

  it('shows an approver the reason without the owner’s next step', () => {
    render(
      <SubmissionStatusStrip
        {...strip({
          status: 'REJECTED',
          viewer: 'approver',
          rejectionReason: 'Not your recording.',
        })}
      />
    );

    expect(text()).toBe('Not approved, so it is offline. Reason: Not your recording.');
  });

  it('says an approved, listed submission is live and listed', () => {
    render(
      <SubmissionStatusStrip {...strip({ status: 'APPROVED', isPublic: true, listed: true })} />
    );

    expect(text()).toBe('Approved and listed.');
  });

  it('says an approved, unlisted submission is reachable by its link only', () => {
    render(<SubmissionStatusStrip {...strip({ status: 'APPROVED', isPublic: true })} />);

    expect(text()).toBe('Approved and unlisted: only people with the link can open it.');
  });

  it('tells an approver an approved submission is hidden while its owner is suspended', () => {
    render(
      <SubmissionStatusStrip
        {...strip({ status: 'APPROVED', viewer: 'approver', isPublic: false })}
      />
    );

    expect(text()).toBe('Approved, but hidden while its owner is suspended.');
  });
});
