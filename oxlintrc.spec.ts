/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface JsPluginEntry {
  name: string;
  specifier: string;
}

interface OxlintOverride {
  files: string[];
  rules?: Record<string, unknown>;
}

interface OxlintConfig {
  plugins: string[];
  jsPlugins: JsPluginEntry[];
  ignorePatterns: string[];
  rules: Record<string, unknown>;
  overrides: OxlintOverride[];
}

interface PackageJson {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  'lint-staged': Record<string, string[]>;
}

const ROOT = resolve(__dirname);
const CONFIG_PATH = resolve(ROOT, '.oxlintrc.json');

/**
 * Drops `//` line comments from JSONC without touching `//` inside strings
 * (the config is commented per repo convention; oxlint reads it as JSONC).
 */
const stripLineComments = (jsonc: string): string => {
  let out = '';
  let inString = false;
  for (let i = 0; i < jsonc.length; i += 1) {
    const ch = jsonc.charAt(i);
    const next = jsonc.charAt(i + 1);
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next;
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < jsonc.length && jsonc.charAt(i) !== '\n') {
        i += 1;
      }
      out += '\n';
    } else {
      out += ch;
    }
  }
  return out;
};

const loadConfig = (): OxlintConfig =>
  JSON.parse(stripLineComments(readFileSync(CONFIG_PATH, 'utf8'))) as OxlintConfig;

const loadPackageJson = (): PackageJson =>
  JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as PackageJson;

const severityOf = (setting: unknown): string =>
  Array.isArray(setting) ? String(setting[0]) : String(setting);

const isConcretePath = (pattern: string): boolean => !/[*?[\]{}]/.test(pattern);

describe('.oxlintrc.json', () => {
  const config = loadConfig();

  it('parses once its comments are stripped', () => {
    expect(config.plugins).toContain('typescript');
    expect(config.plugins).toContain('react');
  });

  it('lets TypeScript infer what it can', () => {
    expect(severityOf(config.rules['typescript/no-inferrable-types'])).toBe('error');
    expect(severityOf(config.rules['boudreaux/no-component-return-type'])).toBe('error');
  });

  it('does not demand explicit return types anywhere', () => {
    expect(config.rules['typescript/explicit-function-return-type']).toBeUndefined();
    expect(config.rules['typescript/explicit-module-boundary-types']).toBeUndefined();
  });

  it('loads the repo-local plugin from a file that exists', () => {
    const local = config.jsPlugins.find(({ name }) => name === 'boudreaux');

    expect(local?.specifier).toBe('./lint/boudreaux-plugin.mjs');
    expect(existsSync(resolve(ROOT, local?.specifier ?? ''))).toBe(true);
  });

  it('keeps Playwright output out of the repo-wide lint', () => {
    expect(config.ignorePatterns).toEqual(
      expect.arrayContaining([
        '**/e2e/playwright-report/**',
        '**/e2e/test-results/**',
        '**/blob-report/**',
      ])
    );
  });

  it('allowlists only files that still exist', () => {
    const concrete = config.overrides
      .flatMap(({ files }) => files)
      .filter(isConcretePath)
      .filter((file) => !file.startsWith('**/'));
    const missing = concrete.filter((file) => !existsSync(resolve(ROOT, file)));

    expect(concrete.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});

describe('lint tooling wiring', () => {
  const pkg = loadPackageJson();

  it('runs oxlint with zero tolerated warnings', () => {
    expect(pkg.scripts.lint).toBe('oxlint --max-warnings 0 --fix');
  });

  it('runs oxlint on staged source files', () => {
    const staged = pkg['lint-staged']['src/**/*.{ts,tsx}'];

    expect(staged).toContain('oxlint --fix');
    expect(staged.join(' ')).not.toMatch(/eslint/);
  });

  it('has retired ESLint itself', () => {
    expect(pkg.devDependencies.eslint).toBeUndefined();
    expect(pkg.devDependencies.oxlint).toBeDefined();
    expect(existsSync(resolve(ROOT, 'eslint.config.mjs'))).toBe(false);
  });
});
