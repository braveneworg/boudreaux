/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { compile } from 'tailwindcss';

const GLOBALS_CSS_PATH = path.join(import.meta.dirname, 'globals.css');
const CUTOUT_UTILITY_PATTERN = /@utility font-fake-four-cutout \{[^}]*\}/;
// Tailwind 4 ships one self-contained stylesheet (theme, preflight and
// utilities inlined), so `@import 'tailwindcss'` needs only this file.
const TAILWIND_INDEX_CSS_PATH = path.resolve(
  import.meta.dirname,
  '../../node_modules/tailwindcss/index.css'
);

/** Read the real globals.css so the spec tracks the shipped stylesheet. */
const readGlobalsCss = (): string => readFileSync(GLOBALS_CSS_PATH, 'utf8');

/** Drop block comments so a `}` inside prose cannot end a block early. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Extract the first block opened by `header` (e.g. `@theme {`), matching
 * braces so nested rules survive. Returns '' when the header is absent.
 */
const extractBlock = (css: string, header: string): string => {
  const source = stripComments(css);
  const start = source.indexOf(header);
  if (start < 0) return '';
  let depth = 0;
  for (let index = start + header.length - 1; index < source.length; index += 1) {
    if (source.charAt(index) === '{') depth += 1;
    if (source.charAt(index) === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
};

/** Serve Tailwind's stylesheet to `compile()` for `@import 'tailwindcss'`. */
const loadTailwindStylesheet = async (): Promise<{
  path: string;
  base: string;
  content: string;
}> => ({
  path: TAILWIND_INDEX_CSS_PATH,
  base: path.dirname(TAILWIND_INDEX_CSS_PATH),
  content: readFileSync(TAILWIND_INDEX_CSS_PATH, 'utf8'),
});

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

/**
 * Compile Tailwind's preflight and the `font-sans` utility against the real
 * `@theme` block in globals.css, so the spec proves what the shipped theme
 * makes of the root default font and the utility.
 */
const buildThemeCss = async (): Promise<string> => {
  const themeBlock = extractBlock(readGlobalsCss(), '@theme {');
  const compiler = await compile(["@import 'tailwindcss';", themeBlock].join('\n'), {
    base: path.dirname(TAILWIND_INDEX_CSS_PATH),
    loadStylesheet: loadTailwindStylesheet,
  });
  return compiler.build(['font-sans']);
};

/** Extract the declarations of the single `.font-fake-four-cutout` rule. */
const getCutoutRuleBody = (css: string): string => {
  const rules = [...css.matchAll(/\.font-fake-four-cutout \{([^}]*)\}/g)];
  expect(rules).toHaveLength(1);
  return rules[0][1];
};

describe('globals.css', () => {
  describe('font-fake-four-cutout utility', () => {
    let cutoutCss: string;

    beforeAll(async () => {
      cutoutCss = await buildCutoutCss();
    });

    it('declares a font-fake-four-cutout utility block', () => {
      expect(readGlobalsCss()).toMatch(CUTOUT_UTILITY_PATTERN);
    });

    it('sets the cutout font family', () => {
      expect(getCutoutRuleBody(cutoutCss)).toContain(
        'font-family: var(--font-family-fake-four-cutout);'
      );
    });

    it('opts out of the Jost heading weight so the single-weight face is not faux-bolded', () => {
      expect(getCutoutRuleBody(cutoutCss)).toMatch(/font-weight: 400;/);
    });

    it('opts out of the Jost heading letter spacing', () => {
      expect(getCutoutRuleBody(cutoutCss)).toMatch(/letter-spacing: normal;/);
    });

    it('opts out of the heading capitalize transform', () => {
      expect(getCutoutRuleBody(cutoutCss)).toMatch(/text-transform: none;/);
    });

    it('leaves text decoration alone so links keep their underline', () => {
      expect(getCutoutRuleBody(cutoutCss)).not.toMatch(/text-decoration/);
    });

    it('sorts before tracking-wide and uppercase so call-site overrides still win', () => {
      const cutoutIndex = cutoutCss.indexOf('.font-fake-four-cutout {');

      expect(cutoutIndex).toBeGreaterThanOrEqual(0);
      expect(cutoutCss.indexOf('.tracking-wide {')).toBeGreaterThan(cutoutIndex);
      expect(cutoutCss.indexOf('.uppercase {')).toBeGreaterThan(cutoutIndex);
    });
  });

  // Site text is Jost through ONE mechanism: the layout defines `--font-jost`
  // on <html>, the theme's `--font-sans` reads it, and Tailwind's preflight
  // reads `--font-sans` for the document default. Every page inherits it, and
  // `font-sans` (ContentContainer) resolves to the same stack.
  describe('font-sans theme', () => {
    let themeCss: string;

    beforeAll(async () => {
      themeCss = await buildThemeCss();
    });

    it('declares --font-sans in the root theme block, not an inline one', () => {
      expect(extractBlock(readGlobalsCss(), '@theme {')).toMatch(/--font-sans:/);
      expect(extractBlock(readGlobalsCss(), '@theme inline {')).not.toMatch(/--font-sans:/);
    });

    it('leads the root --font-sans with the Jost variable', () => {
      expect(themeCss).toMatch(/:root[^{]*\{[^}]*--font-sans: var\(--font-jost\),/);
    });

    it('keeps a generic family and the emoji faces after Jost (the latin subset lacks both)', () => {
      const declaration = themeCss.match(/--font-sans:[^;]*;/)?.[0] ?? '';

      expect(declaration).toMatch(/sans-serif/);
      expect(declaration).toMatch(/Color Emoji/);
    });

    it("makes --font-sans the document default that preflight's html rule reads", () => {
      expect(themeCss).toMatch(/--default-font-family: var\(--font-sans\)/);
      expect(themeCss).toMatch(/html,\s*:host \{[^}]*font-family: var\(--default-font-family/);
    });

    it('resolves the font-sans utility through the theme variable', () => {
      expect(themeCss).toMatch(/\.font-sans \{[^}]*font-family: var\(--font-sans\);/);
    });

    it('no longer hand-sets the html font family in the base layer', () => {
      const baseLayer = extractBlock(readGlobalsCss(), '@layer base {');
      const htmlRule = extractBlock(baseLayer, 'html {');

      expect(htmlRule).not.toBe('');
      expect(htmlRule).not.toMatch(/font-family/);
    });
  });

  describe('base anchor rule', () => {
    it('keeps the permanent underline as the link cue', () => {
      expect(readGlobalsCss()).toMatch(/\ba \{[^}]*text-decoration-line: underline;/);
    });
  });
});
