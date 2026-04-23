import type { Page } from '@playwright/test';

/**
 * Wait for the Turnstile widget to auto-verify using Cloudflare's test site key.
 * The test key "1x0000000000000000000000000000000AA" always passes immediately.
 *
 * The signup/signin form renders a Skeleton loader until Turnstile verifies,
 * so we wait for the email input to become visible as verification confirmation.
 */
async function waitForTurnstileVerification(page: Page, timeout = 15_000) {
  await page.locator('input[id="email"]').waitFor({
    state: 'visible',
    timeout,
  });
}

/**
 * Mock Turnstile by intercepting the Cloudflare challenge script and injecting
 * a fake widget that auto-verifies. Use this fallback if the real test key
 * fails to load in CI (network issues).
 *
 * react-turnstile loads the script with `?onload=cf__reactTurnstileOnLoad&render=explicit`.
 * The library waits for the onload callback before calling `window.turnstile.render()`,
 * so the mock must call it after setting up the fake `window.turnstile` object.
 */
async function mockTurnstile(page: Page) {
  // Ensure Turnstile is available before react-turnstile module code runs.
  // This makes both dev and production bundles skip external script timing races.
  await page.addInitScript(() => {
    const token = 'mock-turnstile-token';
    const setTurnstile = () => {
      (window as typeof window & { turnstile?: Record<string, unknown> }).turnstile = {
        render: (_container: unknown, options?: { callback?: (value: string) => void }) => {
          if (options?.callback) {
            setTimeout(() => options.callback?.(token), 0);
          }
          return 'mock-widget-id';
        },
        reset: () => undefined,
        remove: () => undefined,
        execute: () => undefined,
        getResponse: () => token,
        isExpired: () => false,
      };
    };

    setTurnstile();

    // Some script variants invoke this global callback after loading.
    (window as typeof window & { cf__reactTurnstileOnLoad?: () => void }).cf__reactTurnstileOnLoad =
      () => {
        setTurnstile();
      };
  });

  await page.route('**/challenges.cloudflare.com/**', async (route) => {
    const url = new URL(route.request().url());
    const onloadFn = url.searchParams.get('onload') || 'cf__reactTurnstileOnLoad';

    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.turnstile = {
          render: function(_container, options) {
            if (options && options.callback) {
              setTimeout(function() { options.callback('mock-turnstile-token'); }, 0);
            }
            return 'mock-widget-id';
          },
          reset: function() {},
          remove: function() {},
          execute: function() {},
          getResponse: function() { return 'mock-turnstile-token'; },
          isExpired: function() { return false; },
        };
        if (typeof window["${onloadFn}"] === "function") {
          window["${onloadFn}"]();
        }
      `,
    });
  });
}

export { mockTurnstile, waitForTurnstileVerification };
