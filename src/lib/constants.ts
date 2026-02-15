/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export const APP_VERSION = '0.5.1';

export const CONSTANTS = {
  ROLES: {
    ADMIN: 'admin',
  },
  AUTHENTICATION: {
    STATUS: {
      AUTHENTICATED: 'authenticated',
      LOADING: 'loading',
    },
  },
  ENV: {
    DEVELOPMENT: 'development',
  },
  LOG: {
    PREFIX: {
      AUTH_TOOLBAR: '[AuthToolbar]',
    },
  },
  CDN: {
    // Use NEXT_PUBLIC_CDN_DOMAIN for client-side or fallback to default
    BASE_URL: process.env.NEXT_PUBLIC_CDN_DOMAIN || 'https://cdn.fakefourrecords.com',
  },
  TURNSTILE: {
    // Cloudflare's well-known test secret key for E2E testing
    // @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
    TEST_SECRET: '1x0000000000000000000000000000000AA',
  },
  NA: 'N/A',
};

export const ENTITIES = {
  artist: 'artist',
  release: 'release',
  track: 'track',
  group: 'group',
  featuredArtist: 'featuredArtist',
} as const;
