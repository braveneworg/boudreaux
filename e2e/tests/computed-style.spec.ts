/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Locator, Page } from '@playwright/test';

/**
 * The testable half of the visual smokes: computed styles that encode a
 * shipped design decision. Each test names the PR whose smoke it replaces.
 * Read-only against the seed.
 */

interface TypeStyle {
  fontWeight: string;
  letterSpacing: string;
  textTransform: string;
  textDecorationLine: string;
}

const typeStyleOf = (locator: Locator): Promise<TypeStyle> =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
      textDecorationLine: style.textDecorationLine,
    };
  });

/** A cutout heading drops the base h1/h2 weight, tracking and casing (#784). */
const expectCutout = async (locator: Locator, surface: string): Promise<void> => {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  const style = await typeStyleOf(locator);
  expect(
    {
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
    },
    surface
  ).toEqual({ fontWeight: '400', letterSpacing: 'normal', textTransform: 'none' });
};

/** The computed color a CSS custom property resolves to inside `scope`. */
const resolvedColor = (scope: Locator, property: string): Promise<string> =>
  scope.evaluate((element, name) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${name})`;
    element.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, property);

const backgroundOf = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/** Each public search: its page and the trigger that opens it. */
const SEARCHES = [
  { path: '/', trigger: 'Search artists and releases' },
  { path: '/artists', trigger: 'Search artists' },
  { path: '/videos', trigger: 'Search videos' },
  { path: '/releases', trigger: 'Search releases' },
] as const;

const openSearchField = async (page: Page, path: string, trigger: string): Promise<Locator> => {
  await page.goto(path);
  const button = page.getByRole('button', { name: trigger, exact: true }).first();
  await button.click();
  const field = page.locator('[data-slot="command-input"]').first();
  await expect(field).toBeVisible();
  return field;
};

test.describe('Computed styles of shipped design decisions', () => {
  test('cutout headings opt out of the base heading rules (#784)', async ({ page, adminPage }) => {
    await page.goto('/artists');
    const artistLink = page.locator('a.font-fake-four-cutout[href^="/artists/"]').first();
    await expectCutout(artistLink, 'artist card name');
    // The base anchor underline stays as the link cue (#770).
    expect((await typeStyleOf(artistLink)).textDecorationLine).toContain('underline');

    await page.goto('/videos');
    await expectCutout(
      page.locator('article h2.font-fake-four-cutout').first(),
      'video card title'
    );
    await page.getByRole('button', { name: 'Play E2E Video Alpha' }).click();
    await expectCutout(page.getByRole('dialog').getByRole('heading').first(), 'video dialog title');
    await page.keyboard.press('Escape');

    await page.goto('/releases');
    await page
      .getByRole('button', { name: /^Play E2E Album/ })
      .first()
      .click();
    await expectCutout(
      page.getByRole('dialog').getByRole('heading').first(),
      'release dialog title'
    );

    await adminPage.goto('/admin/videos');
    await expectCutout(
      adminPage.locator('h3.font-fake-four-cutout').first(),
      'admin video card title'
    );
  });

  test('a zine heading keeps its own casing and tracking (#784)', async ({ page }) => {
    await page.goto('/artists/e2e-artist/releases');
    const heading = page.locator('[data-slot="zine-heading"]').first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    const style = await typeStyleOf(heading);
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).not.toBe('normal');
  });

  test('sort toggles fill with the page accent, and the videos search spans the poster column (#768)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/artists');
    const artistsSort = page.getByRole('radiogroup', { name: 'Sort artists' });
    const artistsSelected = artistsSort.getByRole('radio', { checked: true });
    await expect(artistsSelected).toBeVisible();
    expect(await backgroundOf(artistsSelected)).toBe(
      await resolvedColor(artistsSort, '--card-accent')
    );

    await page.goto('/videos');
    const videosSort = page.getByRole('radiogroup', { name: 'Sort videos by release date' });
    const videosSelected = videosSort.getByRole('radio', { checked: true });
    await expect(videosSelected).toBeVisible();
    expect(await backgroundOf(videosSelected)).toBe(
      await resolvedColor(videosSort, '--card-accent-soft')
    );

    const search = page.getByRole('button', { name: 'Search videos', exact: true });
    const posterColumn = page.getByRole('article').first().locator(':scope > *').first();
    const [searchBox, posterBox] = await Promise.all([
      search.boundingBox(),
      posterColumn.boundingBox(),
    ]);
    expect(Math.abs((searchBox?.width ?? 0) - (posterBox?.width ?? -10))).toBeLessThanOrEqual(1);
  });

  // #757, #758: iOS zooms into a focused field under 16px.
  for (const { path, trigger } of SEARCHES) {
    test(`the ${path} search field is 16px on a phone and 14px from md (#757)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const phoneField = await openSearchField(page, path, trigger);
      expect(await phoneField.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        '16px'
      );

      await page.setViewportSize({ width: 1024, height: 900 });
      const deskField = await openSearchField(page, path, trigger);
      expect(await deskField.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
        '14px'
      );
    });
  }

  test('the my-playlists search field is 16px on a phone (#757)', async ({ userPage }) => {
    await userPage.setViewportSize({ width: 390, height: 844 });
    const field = await openSearchField(userPage, '/playlists', 'Search your playlists');
    expect(await field.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
  });

  test('search triggers keep the zine box (#758)', async ({ page }) => {
    for (const { path, trigger } of SEARCHES) {
      await page.goto(path);
      const button = page.getByRole('button', { name: trigger, exact: true }).first();
      await expect(button).toBeVisible();
      const box = await button.evaluate((element) => {
        const style = getComputedStyle(element);
        return { border: style.borderTopWidth, shadow: style.boxShadow };
      });
      expect(box.border, path).toBe('2px');
      expect(box.shadow, path).not.toBe('none');
    }
  });

  test('the video and release forms have no ink edge on their inner card (#743)', async ({
    adminPage,
  }) => {
    for (const path of ['/admin/videos/new', '/admin/releases/new']) {
      await adminPage.goto(path);
      const card = adminPage.locator('[data-slot="zine-panel"] [data-slot="card"]').first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      const edge = await card.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.boxShadow,
          right: style.borderRightWidth,
          bottom: style.borderBottomWidth,
        };
      });
      // Tailwind composes shadow layers, so "none" computes to zero-length ones.
      const lengths = edge.shadow.split(/[\s,]+/).filter((token) => token.endsWith('px'));
      expect(
        lengths.every((length) => parseFloat(length) === 0),
        path
      ).toBe(true);
      expect({ right: edge.right, bottom: edge.bottom }, path).toEqual({
        right: '0px',
        bottom: '0px',
      });
    }
  });

  test('Jost is self-hosted (#799)', async ({ page }) => {
    const googleFontRequests: string[] = [];
    page.on('request', (request) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
        googleFontRequests.push(request.url());
      }
    });
    await page.goto('/');
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        family: getComputedStyle(document.body).fontFamily,
        loaded: [...document.fonts].some(
          (face) => /jost/i.test(face.family) && face.status === 'loaded'
        ),
      };
    });
    expect(fonts.family.toLowerCase()).toContain('jost');
    expect(fonts.loaded).toBe(true);
    expect(googleFontRequests).toEqual([]);
  });
});
