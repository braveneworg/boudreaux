// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Suspense } from 'react';

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatLauncher } from './chat-launcher';

// The App Router bundler aliases `next/dynamic` to the app-dir implementation,
// whose Loadable only wraps the lazy component in its own Suspense boundary
// when `ssr: false` or a `loading` component is supplied. Vitest resolves the
// bare specifier to the pages-router implementation (which always provides a
// boundary), so point it at the app-dir module to test what production runs.
vi.mock('next/dynamic', async () => {
  const mod = await import('next/dist/shared/lib/app-dynamic');
  return { default: mod.default };
});

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: 'user-1', email: 'octo@example.com', name: 'Octo' } },
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/utils/pusher-client', () => ({
  disconnectPusherClient: vi.fn(),
}));

// Gate the chat body module so its chunk stays "in flight" until the test
// releases it. The body is the heaviest client subtree mounted from the root
// layout (Pusher socket, fingerprinting, emoji, markdown); it must leave the
// initial bundle and arrive only when the drawer first opens.
const bodyGate = vi.hoisted(() => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
});
vi.mock('./chat-body', async () => {
  await bodyGate.promise;
  return {
    ChatBody: () => <div data-testid="chat-body-mock">ChatBody</div>,
  };
});

describe('ChatLauncher lazy chat body', () => {
  it('shows the chat loading state inside the drawer while the body chunk is in flight, without suspending the page', async () => {
    const user = userEvent.setup();

    render(
      <Suspense fallback={<div data-testid="page-fallback">route loading</div>}>
        <ChatLauncher />
      </Suspense>
    );

    await user.click(screen.getByRole('button', { name: /open chat/i }));

    expect(screen.getByLabelText('Loading chat')).toBeInTheDocument();
    expect(screen.queryByTestId('page-fallback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-body-mock')).not.toBeInTheDocument();
  });

  it('swaps the loading state for the chat body once its chunk lands', async () => {
    const user = userEvent.setup();

    render(<ChatLauncher />);
    await user.click(screen.getByRole('button', { name: /open chat/i }));

    await act(async () => {
      bodyGate.release();
    });

    expect(await screen.findByTestId('chat-body-mock')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading chat')).not.toBeInTheDocument();
  });
});
