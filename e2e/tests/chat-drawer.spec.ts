/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test as baseTest } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the live-chat drawer.
 *
 * What this suite *does* exercise:
 *   - The floating chat trigger renders for both anonymous and authenticated
 *     visitors.
 *   - The drawer opens to a "Sign in to chat" gate when there is no session.
 *   - Authenticated users can open the drawer, send a message via the
 *     composer, and see it appear in the list (optimistic + server echo).
 *   - A sent message survives closing and reopening the drawer (the
 *     infinite-query cache is the sink for received messages).
 *   - The emoji picker's search input keeps focus, filters, and reacting
 *     works without dismissing the picker or the drawer. This regresses
 *     if vaul and the popover stop sharing a single
 *     @radix-ui/react-focus-scope instance (lockfile dedupe) — the
 *     drawer's focus trap then steals focus from the portaled picker.
 *
 * What this suite intentionally does NOT exercise:
 *   - Cross-browser real-time broadcast over Pusher. The E2E web server runs
 *     with `E2E_MODE=true` and no Pusher credentials, so server-side
 *     `triggerChatEvent` is a no-op and the client uses a stand-in stub.
 *     Multi-client behaviour is covered by the unit tests in
 *     src/app/components/chat/_hooks/use-chat-channel.spec.ts.
 *   - The rate-limit toast. Upstash is short-circuited in `E2E_MODE`, so
 *     11+ rapid sends will not produce a 429.
 */

baseTest.describe('Chat drawer — anonymous', () => {
  baseTest(
    'renders the trigger and shows the sign-in CTA when the drawer is opened',
    async ({ page }) => {
      await page.goto('/');

      const trigger = page.getByRole('button', { name: /open chat/i });
      await expect(trigger).toBeVisible();

      await trigger.click();

      await expect(page.getByText('Sign in to chat')).toBeVisible();
      const signInLink = page.getByRole('link', { name: /sign in/i });
      await expect(signInLink).toHaveAttribute('href', /\/signin\?callbackUrl=/);
    }
  );
});

test.describe('Chat drawer — authenticated', () => {
  test('opens the drawer, shows the empty state, and accepts a sent message', async ({
    userPage,
  }) => {
    await userPage.goto('/');

    await userPage.getByRole('button', { name: /open chat/i }).click();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeVisible();

    const composer = userPage.getByLabel('Chat message');
    await expect(composer).toBeVisible();

    const body = `e2e-${Date.now()}`;
    await composer.fill(body);
    // Wait for React to commit the typed value before pressing Enter so the
    // keydown handler closes over the latest value — otherwise a fill→press
    // race under load can drop the send.
    await expect(composer).toHaveValue(body);
    await composer.press('Enter');

    // Optimistic append + server echo both surface the body in the list.
    await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });

    // The composer is disabled while the send is in flight; wait for it to
    // re-enable so the value assertion runs after the send cycle settles
    // rather than reading a transient mid-send state.
    await expect(composer).toBeEnabled({ timeout: 10_000 });

    // Composer clears after a successful send.
    await expect(composer).toHaveValue('');
  });

  test('keeps a sent message visible after closing and reopening the drawer', async ({
    userPage,
  }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    const composer = userPage.getByLabel('Chat message');
    const body = `e2e-reopen-${Date.now()}`;
    await composer.fill(body);
    await expect(composer).toHaveValue(body);
    await composer.press('Enter');
    await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });
    // Wait for the send cycle to settle (composer re-enabled + cleared) so
    // the server echo — not just the optimistic row — has been applied
    // before the drawer closes.
    await expect(composer).toBeEnabled({ timeout: 10_000 });
    await expect(composer).toHaveValue('');

    // Close the drawer and wait for the exit animation to unmount the body.
    await userPage.getByLabel('Close chat').click();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeHidden();

    // Reopen within the query staleTime: the sent message must be visible
    // immediately — the cached history now carries it instead of a stale
    // first page that predates the send.
    await userPage.getByRole('button', { name: /open chat/i }).click();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeVisible();
    await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });
  });

  test('reopen scrolls to the latest message and stays pinned through resizes', async ({
    userPage,
  }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();
    const composer = userPage.getByLabel('Chat message');
    await expect(composer).toBeVisible();

    // Ensure the list overflows its viewport so scroll position is meaningful.
    const stamp = Date.now();
    for (let i = 0; i < 8; i++) {
      const body = `scroll-fill-${stamp}-${i} — lorem ipsum dolor sit amet`;
      await composer.fill(body);
      await expect(composer).toHaveValue(body);
      await composer.press('Enter');
      await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });
      await expect(composer).toBeEnabled({ timeout: 10_000 });
    }

    const distanceFromBottom = () =>
      userPage.evaluate(() => {
        const el = document.querySelector('[data-testid="chat-message-list"]');
        if (!el) return Number.POSITIVE_INFINITY;
        return el.scrollHeight - el.scrollTop - el.clientHeight;
      });

    await userPage.getByLabel('Close chat').click();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeHidden();
    await userPage.getByRole('button', { name: /open chat/i }).click();
    await expect(userPage.getByText(`scroll-fill-${stamp}-7`, { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // The reopened list anchors to the latest message once layout settles.
    await expect.poll(distanceFromBottom, { timeout: 5_000 }).toBeLessThan(60);

    // A viewport-height change after the anchor (iOS Safari URL-bar
    // collapse / on-screen keyboard) must re-pin the tail while the
    // viewer hasn't scrolled away.
    const viewport = userPage.viewportSize();
    if (viewport) {
      await userPage.setViewportSize({ width: viewport.width, height: viewport.height - 120 });
    }
    await expect.poll(distanceFromBottom, { timeout: 5_000 }).toBeLessThan(60);
  });

  test('emoji picker search filters and reacts without dismissing the drawer', async ({
    userPage,
  }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    // Reaction bars only render on persisted rows, so send a message first.
    const composer = userPage.getByLabel('Chat message');
    const body = `e2e-emoji-${Date.now()}`;
    await composer.fill(body);
    await expect(composer).toHaveValue(body);
    await composer.press('Enter');
    await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });
    await expect(composer).toBeEnabled({ timeout: 10_000 });

    const row = userPage.getByTestId('chat-message-row').filter({ hasText: body });
    await row.getByLabel('Add reaction').click();

    // frimousse renders a real type="search" input inside the popover.
    const search = userPage.getByRole('searchbox');
    await expect(search).toBeVisible();

    // Clicking into the search box used to cascade into dismissals (the
    // drawer's focus trap fought the portaled popover): focus must stay
    // in the input and both surfaces must stay open. While the modal
    // picker is open everything outside it is aria-hidden, so the drawer
    // check must use a testid (role queries can't see aria-hidden nodes).
    await search.click();
    await expect(search).toBeFocused();
    await expect(userPage.getByTestId('chat-message-list')).toBeVisible();

    // frimousse renders emoji as role=gridcell buttons inside the grid.
    await search.fill('thumbs');
    const thumbsUp = userPage.getByRole('gridcell', { name: 'thumbs up' });
    await expect(thumbsUp).toBeVisible({ timeout: 10_000 });
    await thumbsUp.click();

    // Selection closes the picker (drawer stays) and lands as a pill.
    await expect(search).toBeHidden();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeVisible();
    await expect(row.getByRole('button', { name: /React with 👍/ })).toBeVisible({
      timeout: 10_000,
    });

    // Escape closes only the picker — never the drawer underneath.
    await row.getByLabel('Add reaction').click();
    await expect(userPage.getByRole('searchbox')).toBeVisible();
    await userPage.keyboard.press('Escape');
    await expect(userPage.getByRole('searchbox')).toBeHidden();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeVisible();
  });

  test('preserves a newline on Shift+Enter without sending', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    const composer = userPage.getByLabel('Chat message');
    await composer.fill('line 1');
    await composer.press('Shift+Enter');
    await composer.type('line 2');

    await expect(composer).toHaveValue('line 1\nline 2');
  });
});
