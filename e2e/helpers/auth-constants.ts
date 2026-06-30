/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The single source of truth for the E2E `AUTH_SECRET`.
 *
 * This MUST be the same value the web server receives via `webServer.env` in
 * `playwright.config.ts`, because it is the HMAC key better-auth uses to sign
 * and verify the session cookie. A mismatch makes the server's signed-cookie
 * verification reject every minted session.
 *
 * It is intentionally a hardcoded literal — never read from `process.env` —
 * because importing PrismaClient elsewhere in the test process can load `.env`,
 * which may carry a different `AUTH_SECRET`. `playwright.config.ts`,
 * `global-setup.ts`, and the disposable-session helper all import THIS constant
 * so the secret can never drift between them.
 */
export const E2E_AUTH_SECRET = 'e2e-test-secret-key-that-is-at-least-32-characters-long';
