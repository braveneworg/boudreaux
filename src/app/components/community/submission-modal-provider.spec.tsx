/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { StrictMode } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { queryKeys } from '@/lib/query-keys';

import { SubmissionModalProvider } from './submission-modal-provider';
import { useSubmissionModal } from './use-submission-modal';

// The modal itself has its own spec; this stand-in shows what the provider
// asks of it and lets a test dismiss it.
vi.mock('./submission-modal', () => ({
  SubmissionModal: ({
    submissionId,
    open,
    onClose,
    onCloseAutoFocus,
  }: {
    submissionId: string | null;
    open: boolean;
    onClose: () => void;
    onCloseAutoFocus: (event: Event) => void;
  }) => (
    <div data-testid="modal" data-id={submissionId ?? ''} data-open={String(open)}>
      <button type="button" onClick={onClose}>
        Dismiss
      </button>
      {/* What the surface does once it has closed: ask where focus goes. */}
      <button type="button" onClick={() => onCloseAutoFocus(closed)}>
        Finish closing
      </button>
    </div>
  ),
}));

/** The surface's own "I have closed" event; preventing it keeps focus where the host put it. */
let closed = new Event('closeAutoFocus', { cancelable: true });

const ID = 'c'.repeat(24);
const OTHER_ID = 'd'.repeat(24);

const replace = vi.fn();

/** Put the browser at an address, as the router's hooks report it. */
const visit = (pathname: string, search = ''): void => {
  vi.mocked(usePathname).mockReturnValue(pathname);
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(search) as unknown as ReturnType<typeof useSearchParams>
  );
};

/** Something a visitor clicks to open a submission, and to close it from code. */
const Opener = ({ id = ID }: { id?: string }) => {
  const modal = useSubmissionModal();

  return (
    <>
      <button type="button" onClick={({ currentTarget }) => modal?.open(id, currentTarget)}>
        Open {id === ID ? 'one' : 'other'}
      </button>
      <button type="button" onClick={() => modal?.close()}>
        Close from code
      </button>
    </>
  );
};

let queryClient = new QueryClient();

const tree = (children: React.ReactNode = <Opener />) => (
  <QueryClientProvider client={queryClient}>
    <SubmissionModalProvider>{children}</SubmissionModalProvider>
  </QueryClientProvider>
);

/** The modal, once the provider has loaded it. */
const modal = (): Promise<HTMLElement> => screen.findByTestId('modal');

beforeEach(() => {
  queryClient = new QueryClient();
  closed = new Event('closeAutoFocus', { cancelable: true });
  replace.mockReset();
  vi.mocked(useRouter).mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
  visit('/community');
});

describe('SubmissionModalProvider', () => {
  it('renders the page it wraps', () => {
    render(tree(<p>The community page</p>));

    expect(screen.getByText('The community page')).toBeInTheDocument();
  });

  it('loads no modal until a submission is opened', () => {
    render(tree());

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('opens a submission over the page, and changes no address', async () => {
    const user = userEvent.setup();
    render(tree());

    await user.click(screen.getByRole('button', { name: 'Open one' }));

    expect(await modal()).toHaveAttribute('data-id', ID);
    expect(await modal()).toHaveAttribute('data-open', 'true');
    expect(replace).not.toHaveBeenCalled();
  });

  it('closes when the visitor dismisses it, keeping what it showed while it leaves', async () => {
    const user = userEvent.setup();
    render(tree());
    await user.click(screen.getByRole('button', { name: 'Open one' }));

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(await modal()).toHaveAttribute('data-open', 'false');
    expect(await modal()).toHaveAttribute('data-id', ID);
    expect(replace).not.toHaveBeenCalled();
  });

  it('closes from code', async () => {
    const user = userEvent.setup();
    render(tree());
    await user.click(screen.getByRole('button', { name: 'Open one' }));

    await user.click(screen.getByRole('button', { name: 'Close from code' }));

    expect(await modal()).toHaveAttribute('data-open', 'false');
  });

  it('shows another submission when one is opened after the first', async () => {
    const user = userEvent.setup();
    render(
      tree(
        <>
          <Opener />
          <Opener id={OTHER_ID} />
        </>
      )
    );
    await user.click(screen.getByRole('button', { name: 'Open one' }));

    await user.click(screen.getByRole('button', { name: 'Open other' }));

    expect(await modal()).toHaveAttribute('data-id', OTHER_ID);
    expect(await modal()).toHaveAttribute('data-open', 'true');
  });

  it('reads a submission afresh on every opening: what it held may be offline now', async () => {
    const user = userEvent.setup();
    queryClient.setQueryData(queryKeys.submissions.detail(ID), { id: ID });
    queryClient.setQueryData(queryKeys.submissions.detail(OTHER_ID), { id: OTHER_ID });
    render(tree());

    await user.click(screen.getByRole('button', { name: 'Open one' }));

    expect(queryClient.getQueryData(queryKeys.submissions.detail(ID))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.submissions.detail(OTHER_ID))).toEqual({
      id: OTHER_ID,
    });
  });

  it('returns focus to what opened it once it has closed: the surface has no trigger of its own', async () => {
    const user = userEvent.setup();
    render(tree());
    const opener = screen.getByRole('button', { name: 'Open one' });
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await user.click(screen.getByRole('button', { name: 'Finish closing' }));

    expect(opener).toHaveFocus();
    expect(closed.defaultPrevented).toBe(true);
  });

  it('leaves focus alone when what opened it is gone', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree());
    await user.click(screen.getByRole('button', { name: 'Open one' }));
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    // The page beneath changed, and the opener went with it.
    rerender(tree(<p>Another page</p>));

    await user.click(screen.getByRole('button', { name: 'Finish closing' }));

    expect(closed.defaultPrevented).toBe(false);
  });

  it('closes when the visitor moves to another page', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree());
    await user.click(screen.getByRole('button', { name: 'Open one' }));

    visit('/community/mine');
    rerender(tree());

    expect(await modal()).toHaveAttribute('data-open', 'false');
  });

  it('closes when only the query string changes, as a username link does', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree());
    await user.click(screen.getByRole('button', { name: 'Open one' }));

    visit('/community', 'user=ada');
    rerender(tree());

    expect(await modal()).toHaveAttribute('data-open', 'false');
  });

  describe('on a submission deep link', () => {
    it('opens the submission the address names, on arrival', async () => {
      visit('/community', `submission=${ID}`);

      render(tree());

      expect(await modal()).toHaveAttribute('data-id', ID);
      expect(await modal()).toHaveAttribute('data-open', 'true');
    });

    it('keeps what the server read for it', async () => {
      queryClient.setQueryData(queryKeys.submissions.detail(ID), { id: ID });
      visit('/community', `submission=${ID}`);

      render(tree());
      await modal();

      expect(queryClient.getQueryData(queryKeys.submissions.detail(ID))).toEqual({ id: ID });
    });

    it('opens once under StrictMode’s replayed effects', async () => {
      visit('/community', `submission=${ID}`);

      render(<StrictMode>{tree()}</StrictMode>);

      expect(await screen.findAllByTestId('modal')).toHaveLength(1);
      expect(await modal()).toHaveAttribute('data-open', 'true');
    });

    it.each(['not-an-id', '', 'c'.repeat(23)])(
      'opens nothing for a value that cannot be an id (%s)',
      (value) => {
        visit('/community', `submission=${value}`);

        render(tree());

        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
      }
    );

    it('closes onto the page without the link, so back and refresh do not reopen it', async () => {
      const user = userEvent.setup();
      visit('/community', `submission=${ID}`);
      render(tree());

      await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

      expect(await modal()).toHaveAttribute('data-open', 'false');
      expect(replace.mock.calls).toEqual([['/community', { scroll: false }]]);
    });

    it('keeps the rest of the query when it closes', async () => {
      const user = userEvent.setup();
      visit('/community', `user=ada&submission=${ID}`);
      render(tree());

      await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

      expect(replace.mock.calls).toEqual([['/community?user=ada', { scroll: false }]]);
    });

    it('has nothing to return focus to: nothing on the page opened it', async () => {
      const user = userEvent.setup();
      visit('/community', `submission=${ID}`);
      render(tree());
      await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

      await user.click(screen.getByRole('button', { name: 'Finish closing' }));

      expect(closed.defaultPrevented).toBe(false);
    });

    it('stays closed once dismissed, while the address catches up', async () => {
      const user = userEvent.setup();
      visit('/community', `submission=${ID}`);
      const { rerender } = render(tree());
      await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

      rerender(tree());

      expect(await modal()).toHaveAttribute('data-open', 'false');
    });

    it('opens another submission in place over a deep-linked page', async () => {
      const user = userEvent.setup();
      visit('/community', `submission=${ID}`);
      render(tree(<Opener id={OTHER_ID} />));
      await modal();

      await user.click(screen.getByRole('button', { name: 'Open other' }));

      expect(await modal()).toHaveAttribute('data-id', OTHER_ID);
      expect(await modal()).toHaveAttribute('data-open', 'true');
    });
  });
});
