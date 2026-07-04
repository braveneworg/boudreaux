/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { BioGenerationResult } from '@/lib/validation/bio-generation-schema';

export interface BioGenerationLambdaInput {
  artistId: string;
  displayName: string;
  realName?: string;
  akaNames?: string;
  links?: string[];
  description?: string;
  existingGenres?: string;
  bornOn?: string;
  diedOn?: string;
  formedOn?: string;
  releases?: Array<{ title: string; releasedOn?: string; url: string }>;
}

/**
 * Deterministic bio-generation result used when `BIO_GENERATOR_FAKE=true`
 * (E2E and local dev without a deployed Lambda). Echoes the artist name so
 * tests can assert the content rendered end-to-end. The long bio weaves a valid
 * inline `<a>` (must render as a Next Link) and a `javascript:` link (must be
 * stripped) so sanitization + Link mapping are exercised by the real flow. The
 * image uses a `picsum.photos` URL (allowed in `next.config` remotePatterns) so
 * it renders through next/image when re-hosting is skipped in fake mode.
 */
export const fakeBioGeneration = (input: BioGenerationLambdaInput): BioGenerationResult => ({
  ok: true,
  data: {
    shortBio: `${input.displayName} is a boundary-pushing artist on the roster.`,
    longBio:
      `<p><strong>${input.displayName}</strong> builds immersive soundscapes that blur genre lines.</p>` +
      `<p>Read more on <a href="https://en.wikipedia.org/wiki/Music">their Wikipedia page</a>.</p>` +
      `<a href="javascript:alert(1)">unsafe</a>`,
    altBio: `<p><strong>${input.displayName}</strong> — essential listening. Dive in on <a href="https://en.wikipedia.org/wiki/Music">Wikipedia</a>.</p>`,
    genres: input.existingGenres?.trim() || 'experimental, electronic',
    images: [
      {
        url: 'https://picsum.photos/seed/e2e-bio/1200/800',
        thumbnailUrl: 'https://picsum.photos/seed/e2e-bio/400/300',
        title: `${input.displayName} portrait`,
        // Attribution metadata is kept through re-host (PR #547).
        attribution: 'Public domain',
        license: 'Public domain',
        sourceUrl: null,
        width: 1200,
        height: 800,
        isPrimary: true,
        kind: 'photo',
        alt: `${input.displayName} portrait photo`,
      },
      {
        url: 'https://picsum.photos/seed/e2e-cover/1000/1000',
        thumbnailUrl: 'https://picsum.photos/seed/e2e-cover/400/400',
        title: 'Fixture Album',
        attribution: 'Cover Art Archive',
        license: null,
        sourceUrl: null,
        width: 1000,
        height: 1000,
        isPrimary: false,
        kind: 'cover',
        alt: 'Fixture Album cover art',
      },
    ],
    links: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Music', kind: 'wikipedia' },
      {
        label: 'An interview with the artist',
        url: 'https://example.com/interview',
        kind: 'press' as const,
      },
      ...(input.links ?? []).map((url) => ({ label: 'Reference', url, kind: 'other' as const })),
    ],
    model: 'fake/deterministic',
  },
});
