/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for ADR-0020: the admin edits an artist's links as three
 * sections, a save stores one composite in the admin's order with contact
 * hrefs normalised and empty groups dropped, and clearing every link stores
 * no composite at all.
 *
 * Each test seeds its own artist with a fresh stamp and the worker removes
 * the rows it made by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const made: string[] = [];

/** A fresh stamp per seed, so repeated copies of a test never collide. */
const newStamp = (): string => randomUUID().slice(0, 8);

/** An unpublished artist, with or without stored links; returns its id. */
const seedArtist = async (
  label: string,
  stamp: string,
  links?: {
    websites: { label: string | null; url: string }[];
    social: { label: string | null; url: string }[];
    contact: { heading: string; links: { label: string | null; url: string }[] }[];
  }
): Promise<string> => {
  const { id } = await prisma.artist.create({
    data: {
      firstName: 'ZZ',
      surname: `E2E Links ${label} ${stamp}`,
      displayName: `ZZ E2E Links ${label} ${stamp}`,
      slug: `e2e-links-${label.toLowerCase()}-${stamp}`,
      ...(links ? { links } : {}),
    },
    select: { id: true },
  });
  made.push(id);
  return id;
};

const readLinks = async (id: string) =>
  (await prisma.artist.findUniqueOrThrow({ where: { id }, select: { links: true } })).links;

const gotoEdit = async (page: Page, id: string): Promise<void> => {
  await page.goto(`/admin/artists/${id}`);
  await expect(page.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('region', { name: 'Links' })).toBeVisible();
};

const save = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });
};

test.afterAll(async () => {
  await prisma.artist.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test.describe('Artist links (ADR-0020)', () => {
  test('saves the three sections in order, normalised, without empty groups', async ({
    adminPage,
  }) => {
    const stamp = newStamp();
    const id = await seedArtist('Edit', stamp);
    await gotoEdit(adminPage, id);

    // Booking and Merch are prefilled, and nothing is dirty yet.
    await expect(adminPage.getByRole('textbox', { name: 'Group 1 heading' })).toHaveValue(
      'Booking'
    );
    await expect(adminPage.getByRole('textbox', { name: 'Group 2 heading' })).toHaveValue('Merch');
    await expect(adminPage.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await adminPage.getByRole('button', { name: 'Add website link' }).click();
    await adminPage.getByRole('textbox', { name: 'Website link 1 label' }).fill('Official site');
    await adminPage
      .getByRole('textbox', { name: 'Website link 1 URL' })
      .fill(`https://example.com/${stamp}`);
    await adminPage.getByRole('button', { name: 'Add website link' }).click();
    await adminPage
      .getByRole('textbox', { name: 'Website link 2 URL' })
      .fill(`https://${stamp}.bandcamp.com`);

    await adminPage.getByRole('button', { name: 'Add social link' }).click();
    const socialUrl = adminPage.getByRole('textbox', { name: 'Social link 1 URL' });
    await socialUrl.fill(`https://www.instagram.com/${stamp}`);
    // The icon follows the href as it is typed; nothing is stored for it.
    await expect(
      adminPage.getByRole('list', { name: 'Social links' }).locator('[data-icon="instagram"]')
    ).toBeVisible();

    await adminPage.getByRole('button', { name: 'Add link to group 1' }).click();
    await adminPage.getByRole('textbox', { name: 'Group 1 link 1 label' }).fill('Agent');
    await adminPage
      .getByRole('textbox', { name: 'Group 1 link 1 URL' })
      .fill(`agent-${stamp}@example.com`);

    await save(adminPage);

    expect(await readLinks(id)).toEqual({
      websites: [
        { label: 'Official site', url: `https://example.com/${stamp}` },
        { label: null, url: `https://${stamp}.bandcamp.com` },
      ],
      social: [{ label: null, url: `https://www.instagram.com/${stamp}` }],
      contact: [
        {
          heading: 'Booking',
          links: [{ label: 'Agent', url: `mailto:agent-${stamp}@example.com` }],
        },
      ],
    });

    // A reload shows the stored links; the empty Merch group was not saved.
    await gotoEdit(adminPage, id);
    await expect(adminPage.getByRole('textbox', { name: 'Website link 1 label' })).toHaveValue(
      'Official site'
    );
    await expect(adminPage.getByRole('textbox', { name: 'Group 1 link 1 URL' })).toHaveValue(
      `mailto:agent-${stamp}@example.com`
    );
    await expect(adminPage.getByRole('textbox', { name: 'Group 2 heading' })).toHaveCount(0);
  });

  test('reordering a link is stored in the new order', async ({ adminPage }) => {
    const stamp = newStamp();
    const id = await seedArtist('Order', stamp, {
      websites: [
        { label: null, url: `https://a.example.com/${stamp}` },
        { label: null, url: `https://b.example.com/${stamp}` },
      ],
      social: [],
      contact: [],
    });
    await gotoEdit(adminPage, id);

    await adminPage.getByRole('button', { name: 'Move website link 1 later' }).click();
    await save(adminPage);

    const links = await readLinks(id);
    expect(links?.websites.map(({ url }) => url)).toEqual([
      `https://b.example.com/${stamp}`,
      `https://a.example.com/${stamp}`,
    ]);
  });

  test('clearing every link stores no composite', async ({ adminPage }) => {
    const stamp = newStamp();
    const id = await seedArtist('Clear', stamp, {
      websites: [{ label: null, url: `https://example.com/${stamp}` }],
      social: [],
      contact: [{ heading: 'Booking', links: [{ label: null, url: 'tel:+18605550134' }] }],
    });
    await gotoEdit(adminPage, id);

    await adminPage.getByRole('button', { name: 'Remove website link 1' }).click();
    await adminPage.getByRole('button', { name: 'Remove group 1 link 1' }).click();
    await save(adminPage);

    expect(await readLinks(id)).toBeNull();
  });

  test('refuses a website link that is not a URL, naming the field', async ({ adminPage }) => {
    const id = await seedArtist('Invalid', newStamp());
    await gotoEdit(adminPage, id);

    await adminPage.getByRole('button', { name: 'Add website link' }).click();
    const url = adminPage.getByRole('textbox', { name: 'Website link 1 URL' });
    await url.fill('not a url');
    await adminPage.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(url).toHaveAccessibleDescription(/http\(s\) URL/i);
    expect(await readLinks(id)).toBeNull();
  });
});
