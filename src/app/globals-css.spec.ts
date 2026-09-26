/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { compile } from 'tailwindcss';

const GLOBALS_CSS_PATH = path.join(import.meta.dirname, 'globals.css');
const CUTOUT_UTILITY_PATTERN = /@utility font-fake-four-cutout \{[^}]*\}/;

/** Read the real globals.css so the spec tracks the shipped stylesheet. */
const readGlobalsCss = (): string => readFileSync(GLOBALS_CSS_PATH, 'utf8');

/**
 * Compile the `font-fake-four-cutout` utility block from globals.css with a
 * minimal theme, alongside the utilities that cutout call sites pair with it.
 */
const buildCutoutCss = async (): Promise<string> => {
  const utilityBlock = readGlobalsCss().match(CUTOUT_UTILITY_PATTERN)?.[0] ?? '';
  const input = [
    '@theme inline {',
    '  --font-fake-four-cutout: var(--font-family-fake-four-cutout);',
    '  --tracking-wide: 0.025em;',
    '}',
    '@tailwind utilities;',
    utilityBlock,
  ].join('\n');
  const compiler = await compile(input);
  return compiler.build(['font-fake-four-cutout', 'tracking-wide', 'uppercase']);
};

/** Extract the declarations of the single `.font-fake-four-cutout` rule. */
const getCutoutRuleBody = (css: string): string => {
  const rules = [...css.matchAll(/\.font-fake-four-cutout \{([^}]*)\}/g)];
  expect(rules).toHaveLength(1);
  return rules[0][1];
};

describe('globals.css', () => {
  describe('font-fake-four-cutout utility', () => {
    it('declares a font-fake-four-cutout utility block', () => {
      expect(readGlobalsCss()).toMatch(CUTOUT_UTILITY_PATTERN);
    });

    it('sets the cutout font family', async () => {
      const body = getCutoutRuleBody(await buildCutoutCss());

      expect(body).toContain('font-family: var(--font-family-fake-four-cutout);');
    });

    it('opts out of the Jost heading weight so the single-weight face is not faux-bolded', async () => {
      const body = getCutoutRuleBody(await buildCutoutCss());

      expect(body).toMatch(/font-weight: 400;/);
    });

    it('opts out of the Jost heading letter spacing', async () => {
      const body = getCutoutRuleBody(await buildCutoutCss());

      expect(body).toMatch(/letter-spacing: normal;/);
    });

    it('opts out of the heading capitalize transform', async () => {
      const body = getCutoutRuleBody(await buildCutoutCss());

      expect(body).toMatch(/text-transform: none;/);
    });

    it('leaves text decoration alone so links keep their underline', async () => {
      const body = getCutoutRuleBody(await buildCutoutCss());

      expect(body).not.toMatch(/text-decoration/);
    });

    it('sorts before tracking-wide and uppercase so call-site overrides still win', async () => {
      const css = await buildCutoutCss();
      const cutoutIndex = css.indexOf('.font-fake-four-cutout {');

      expect(cutoutIndex).toBeGreaterThanOrEqual(0);
      expect(css.indexOf('.tracking-wide {')).toBeGreaterThan(cutoutIndex);
      expect(css.indexOf('.uppercase {')).toBeGreaterThan(cutoutIndex);
    });
  });

  describe('base anchor rule', () => {
    it('keeps the permanent underline as the link cue', () => {
      expect(readGlobalsCss()).toMatch(/\ba \{[^}]*text-decoration-line: underline;/);
    });
  });
});
