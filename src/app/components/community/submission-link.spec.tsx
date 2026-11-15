/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';

import { SubmissionLink } from './submission-link';
import { SubmissionModalContext, type SubmissionModalControls } from './use-submission-modal';

// Surfaces the link's prefetch posture, which is Link behaviour and not a
// DOM attribute.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={prefetch === undefined ? 'default' : String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

const ID = 'c'.repeat(24);

const controls = (): SubmissionModalControls => ({ open: vi.fn(), close: vi.fn() });

const renderLink = (modal: SubmissionModalControls | null) =>
  render(
    <SubmissionModalContext value={modal}>
      <SubmissionLink submissionId={ID} className="underline">
        Bus poem
      </SubmissionLink>
    </SubmissionModalContext>
  );

/** A click React handles, reporting whether its default (following the href) was prevented. */
const click = (init: MouseEventInit = {}): boolean =>
  !fireEvent.click(screen.getByRole('link', { name: 'Bus poem' }), init);

describe('SubmissionLink', () => {
  it('carries the submission deep link as its href', () => {
    renderLink(controls());

    expect(screen.getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'href',
      `/community?submission=${ID}`
    );
  });

  it('does not prefetch: the deep link is the whole community page', () => {
    renderLink(controls());

    expect(screen.getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'data-prefetch',
      'false'
    );
  });

  it('opens the submission in place on a plain click, and goes nowhere', () => {
    const modal = controls();
    renderLink(modal);

    const prevented = click();

    // With itself, so focus can come back to it when the submission closes.
    expect(vi.mocked(modal.open).mock.calls).toEqual([
      [ID, screen.getByRole('link', { name: 'Bus poem' })],
    ]);
    expect(prevented).toBe(true);
  });

  it.each([
    ['a command click', { metaKey: true }],
    ['a control click', { ctrlKey: true }],
    ['a shift click', { shiftKey: true }],
    ['a middle click', { button: 1 }],
  ])('leaves %s to the browser, which opens the deep link', (_name, init) => {
    const modal = controls();
    renderLink(modal);

    const prevented = click(init);

    expect(modal.open).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it('says it opens a dialog once it can', () => {
    renderLink(controls());

    expect(screen.getByRole('link', { name: 'Bus poem' })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    );
  });

  it('is a plain link to the deep link where no modal is hosted', () => {
    renderLink(null);

    const prevented = click();

    expect(prevented).toBe(false);
    expect(screen.getByRole('link', { name: 'Bus poem' })).not.toHaveAttribute('aria-haspopup');
  });

  it('passes its class to the link', () => {
    renderLink(controls());

    expect(screen.getByRole('link', { name: 'Bus poem' })).toHaveClass('underline');
  });
});
