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
  await page.route('**/challenges.cloudflare.com/**', async (route) => {
    const url = new URL(route.request().url());
    const onloadFn = url.searchParams.get('onload') || 'cf__reactTurnstileOnLoad';

    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.turnstile = {
          render: function(container, options) {
            if (options.callback) {
              setTimeout(function() { options.callback('mock-turnstile-token'); }, 100);
            }
            return 'mock-widget-id';
          },
          reset: function() {},
          remove: function() {},
        };
        if (typeof window["${onloadFn}"] === "function") {
          window["${onloadFn}"]();
        }
      `,
    });
  });
}

export { mockTurnstile, waitForTurnstileVerification };
