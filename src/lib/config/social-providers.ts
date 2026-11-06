/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The social sign-in providers the app knows, in the order their buttons
 * render. Client-safe: no env reads. Which of them are enabled is decided on
 * the server (`enabledSocialProviders()` in `runtime-config.ts`) and handed to
 * the client as a prop.
 */
export const SOCIAL_PROVIDER_IDS = ['apple', 'google', 'facebook', 'twitter'] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];
