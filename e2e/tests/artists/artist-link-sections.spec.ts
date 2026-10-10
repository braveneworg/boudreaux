/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../../fixtures/base.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * The link sections of the public artist page (ADR-0020), as a visitor sees
 * them: what a link reads as, and where its parts sit. The layout is
 * measured, because a class on the element proves nothing about the box it
 * draws.
 *
 * Each test seeds its own published artist with a fresh stamp, named "ZZ" so
 * it files after every seeded artist and dated in 2000 so it never leads a
 * newest-first listing. Rows are removed by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const PAST = new Date('2000-01-01T00:00:00.000Z');
/** The space between two rows of a link list, in CSS pixels. */
const ROW_GAP = 8;
/** Sub-pixel slack for two boxes that share an edge. */
const EDGE_SLACK = 1;

const made: string[] = [];

interface SeededLinks {
  slug: string;
  site: string;
  profile: string;
  address: string;
}

/** A published artist with links in all three sections; returns what the page shows. */
const seedArtist = async (): Promise<SeededLinks> => {
  const stamp = randomUUID().slice(0, 8);
  const slug = `e2e-link-sections-${stamp}`;
  const address = `agent-${stamp}@example.com`;
  const { id } = await prisma.artist.create({
    data: {
      firstName: 'ZZ',
      surname: `E2E Link Sections ${stamp}`,
      displayName: `ZZ E2E Link Sections ${stamp}`,
      slug,
      publishedOn: PAST,
      links: {
        websites: [
          { label: 'Official site', url: `https://www.example.com/${stamp}` },
          { label: 'Shop', url: `https://shop.example.com/${stamp}` },
        ],
        social: [{ label: null, url: `https://www.instagram.com/${stamp}/` }],
        contact: [
          {
            heading: 'Booking',
            links: [
              { label: 'Agent', url: `mailto:${address}` },
              { label: 'Office', url: 'tel:+18605550134' },
            ],
          },
        ],
      },
    },
    select: { id: true },
  });
  made.push(id);
  return {
    slug,
    site: `example.com/${stamp}`,
    profile: `instagram.com/${stamp}`,
    address,
  };
};

const openArtist = async (page: Page, slug: string): Promise<void> => {
  await page.goto(`/artists/${slug}`);
  await expect(page.getByRole('region', { name: 'Contact & Misc' })).toBeVisible({
    timeout: 15_000,
  });
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box a visible element draws. */
const boxOf = async (locator: Locator): Promise<Box> => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('A visible element has no box');
  return box;
};

const bottomOf = ({ y, height }: Box): number => y + height;

test.afterAll(async () => {
  await prisma.artist.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test.describe('Artist page link sections (ADR-0020)', () => {
  test('a website and a social link read as the address after the www', async ({ page }) => {
    const { slug, site, profile } = await seedArtist();
    await openArtist(page, slug);

    await expect(
      page.getByRole('region', { name: 'Websites' }).getByRole('link', { name: site, exact: true })
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Social Media' })
        .getByRole('link', { name: profile, exact: true })
    ).toBeVisible();
  });

  test('a contact address sits under its label, on the label’s left edge', async ({ page }) => {
    const { slug, address } = await seedArtist();
    await openArtist(page, slug);

    const contact = page.getByRole('region', { name: 'Contact & Misc' });
    const label = await boxOf(contact.getByText('Agent', { exact: true }));
    const link = await boxOf(contact.getByRole('link', { name: address, exact: true }));

    expect(link.y).toBeGreaterThanOrEqual(bottomOf(label) - EDGE_SLACK);
    expect(Math.abs(link.x - label.x)).toBeLessThanOrEqual(EDGE_SLACK);
  });

  // Only Contact & Misc stacks: a website row stays one ledger line.
  test('a website link stays on the line of its label', async ({ page }) => {
    const { slug, site } = await seedArtist();
    await openArtist(page, slug);

    const websites = page.getByRole('region', { name: 'Websites' });
    const label = await boxOf(websites.getByText('Official site', { exact: true }));
    const link = await boxOf(websites.getByRole('link', { name: site, exact: true }));

    expect(link.y).toBeLessThan(bottomOf(label));
    expect(link.x).toBeGreaterThan(label.x + label.width);
  });

  test('the rows of a link list sit 8px apart', async ({ page }) => {
    const { slug } = await seedArtist();
    await openArtist(page, slug);

    for (const name of ['Websites', 'Contact & Misc']) {
      const rows = page.getByRole('region', { name }).getByRole('listitem');
      await expect(rows).toHaveCount(2);
      const first = await boxOf(rows.nth(0));
      const second = await boxOf(rows.nth(1));

      expect(second.y - bottomOf(first), name).toBeCloseTo(ROW_GAP, 0);
    }
  });
});
