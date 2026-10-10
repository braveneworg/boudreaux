/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * E2E coverage for ADR-0020: the admin edits an artist's links as three
 * sections, a save stores one composite in the admin's order with contact
 * hrefs normalised, a contact link's description beside its label and empty
 * groups dropped, and clearing every link stores no composite at all.
 *
 * Each test seeds its own artist with a fresh stamp and the worker removes
 * the rows it made by id.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

/** Sub-pixel slack for two boxes that share an edge. */
const EDGE_SLACK = 1;
/** A phone-sized viewport, below the breakpoint that puts label and URL on one line. */
const PHONE = { width: 390, height: 844 };

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
    contact: {
      heading: string;
      links: { label: string | null; description: string | null; url: string }[];
    }[];
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

interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The edges of the box a visible element draws. */
const edgesOf = async (locator: Locator): Promise<Edges> => {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('A visible element has no box');
  return { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
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
    await adminPage
      .getByRole('textbox', { name: 'Group 1 link 1 description' })
      .fill('Books North American tours');
    // A second contact link, saved without a description.
    await adminPage.getByRole('button', { name: 'Add link to group 1' }).click();
    await adminPage.getByRole('textbox', { name: 'Group 1 link 2 label' }).fill('Office');
    await adminPage.getByRole('textbox', { name: 'Group 1 link 2 URL' }).fill('+1 (860) 555-0134');

    await save(adminPage);

    // Only a contact link stores a description: `toEqual` would fail on a
    // `description` key in a website or social link.
    expect(await readLinks(id)).toEqual({
      websites: [
        { label: 'Official site', url: `https://example.com/${stamp}` },
        { label: null, url: `https://${stamp}.bandcamp.com` },
      ],
      social: [{ label: null, url: `https://www.instagram.com/${stamp}` }],
      contact: [
        {
          heading: 'Booking',
          links: [
            {
              label: 'Agent',
              description: 'Books North American tours',
              url: `mailto:agent-${stamp}@example.com`,
            },
            { label: 'Office', description: null, url: 'tel:+18605550134' },
          ],
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
    await expect(
      adminPage.getByRole('textbox', { name: 'Group 1 link 1 description' })
    ).toHaveValue('Books North American tours');
    await expect(
      adminPage.getByRole('textbox', { name: 'Group 1 link 2 description' })
    ).toHaveValue('');
    await expect(adminPage.getByRole('textbox', { name: 'Group 2 heading' })).toHaveCount(0);
    // The loaded descriptions are the form's defaults: nothing is dirty.
    await expect(adminPage.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });

  // The layout is measured, because a class proves nothing about the box.
  test('a contact description has its own line under the label and URL, as wide as they are', async ({
    adminPage,
  }) => {
    const id = await seedArtist('Layout', newStamp(), {
      websites: [],
      social: [],
      contact: [
        {
          heading: 'Booking',
          links: [
            { label: 'Agent', description: 'Books US tours', url: 'mailto:agent@example.com' },
          ],
        },
      ],
    });
    await gotoEdit(adminPage, id);
    const labelInput = adminPage.getByRole('textbox', { name: 'Group 1 link 1 label' });
    const urlInput = adminPage.getByRole('textbox', { name: 'Group 1 link 1 URL' });
    const descriptionInput = adminPage.getByRole('textbox', {
      name: 'Group 1 link 1 description',
    });
    const removeButton = adminPage.getByRole('button', { name: 'Remove group 1 link 1' });

    // Desktop: label and URL share a line, the row's buttons beside them.
    const label = await edgesOf(labelInput);
    const url = await edgesOf(urlInput);
    const description = await edgesOf(descriptionInput);
    const remove = await edgesOf(removeButton);
    expect(url.top).toBeLessThan(label.bottom);
    expect(remove.top).toBeLessThan(url.bottom);
    expect(description.top).toBeGreaterThanOrEqual(url.bottom);
    expect(Math.abs(description.left - label.left)).toBeLessThanOrEqual(EDGE_SLACK);
    expect(Math.abs(description.right - url.right)).toBeLessThanOrEqual(EDGE_SLACK);

    // Phone: the label has a line of its own, and the description is as wide.
    await adminPage.setViewportSize(PHONE);
    const phoneLabel = await edgesOf(labelInput);
    const phoneUrl = await edgesOf(urlInput);
    const phoneDescription = await edgesOf(descriptionInput);
    expect(phoneUrl.top).toBeGreaterThanOrEqual(phoneLabel.bottom);
    expect(phoneDescription.top).toBeGreaterThanOrEqual(phoneUrl.bottom);
    expect(Math.abs(phoneDescription.left - phoneLabel.left)).toBeLessThanOrEqual(EDGE_SLACK);
    expect(Math.abs(phoneDescription.right - phoneLabel.right)).toBeLessThanOrEqual(EDGE_SLACK);
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
      contact: [
        {
          heading: 'Booking',
          links: [{ label: null, description: 'Call after noon', url: 'tel:+18605550134' }],
        },
      ],
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
