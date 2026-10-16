/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import tsconfig from '../tsconfig.json' with { type: 'json' };

// `pnpm run seed` runs `tsx prisma/seed.ts` with no React Server condition,
// so any module in its import graph that imports `server-only` throws at load
// time. Executing the seed here would run `main()` against a database, and the
// global `vi.mock('server-only')` would hide the throw anyway, so this spec
// walks the static import graph instead.
const ROOT = join(__dirname, '..');
const SEED = join(ROOT, 'prisma', 'seed.ts');
const SERVER_ONLY = 'server-only';
const RESOLVE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

// `from '…'` covers imports (`import type` included) and `export … from`;
// `import '…'` and `import('…')` cover side-effect and dynamic imports.
const SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;

/** Every import and export-from specifier in a source file, in order. */
const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(SPECIFIER)].map(([, from, bare]) => from ?? bare);

// tsconfig `paths`, most specific first, so `@/components/x` maps to
// `src/app/components/x` and only the bare `@/x` falls through to `src/x`.
const ALIASES = Object.entries(tsconfig.compilerOptions.paths)
  .map(([pattern, [target]]) => ({
    prefix: pattern.replace(/\*$/, ''),
    wildcard: pattern.endsWith('*'),
    target: join(ROOT, target.replace(/\*$/, '')),
  }))
  .sort((a, b) => b.prefix.length - a.prefix.length);

const aliasBase = (specifier: string): string | undefined => {
  const alias = ALIASES.find(({ prefix, wildcard }) =>
    wildcard ? specifier.startsWith(prefix) : specifier === prefix
  );
  return alias && join(alias.target, specifier.slice(alias.prefix.length));
};

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

/**
 * The first-party file a specifier resolves to, or undefined for a bare
 * package. Throws on a first-party specifier that resolves to nothing, so a
 * missed alias can never hide part of the graph.
 */
const resolveSpecifier = (from: string, specifier: string): string | undefined => {
  const base = specifier.startsWith('.') ? join(dirname(from), specifier) : aliasBase(specifier);
  if (!base) return undefined;

  const resolved = [base, ...RESOLVE_SUFFIXES.map((suffix) => `${base}${suffix}`)].find(isFile);
  if (!resolved) {
    throw new Error(`${relative(ROOT, from)}: cannot resolve '${specifier}'`);
  }
  return resolved;
};

/**
 * Each chain of files from `entry` to a file that imports `server-only`,
 * written `a.ts → b.ts → server-only`. A file that imports `server-only` ends
 * its chain; its own imports are not walked.
 */
const serverOnlyChains = (entry: string): string[] => {
  const visited = new Set<string>();
  const chains: string[] = [];

  const walk = (file: string, chain: string[]): void => {
    if (visited.has(file)) return;
    visited.add(file);

    const path = [...chain, relative(ROOT, file)];
    const specifiers = importSpecifiers(readFileSync(file, 'utf8'));
    if (specifiers.includes(SERVER_ONLY)) {
      chains.push([...path, SERVER_ONLY].join(' → '));
      return;
    }

    specifiers.forEach((specifier) => {
      const next = resolveSpecifier(file, specifier);
      if (next) walk(next, path);
    });
  };

  walk(entry, []);
  return chains;
};

describe('prisma/seed.ts', () => {
  it('reads every import and export-from specifier form', () => {
    expect(
      importSpecifiers(
        [
          "import 'server-only';",
          "import { a } from './a';",
          'import type { B } from "@/lib/b";',
          'import {\n  c,\n  d,\n} from "../c";',
          "export * from './e';",
          "export { f } from '@/components/f';",
          "const g = await import('./g');",
          "import h from 'h-package';",
        ].join('\n')
      )
    ).toEqual([
      'server-only',
      './a',
      '@/lib/b',
      '../c',
      './e',
      '@/components/f',
      './g',
      'h-package',
    ]);
  });

  it('imports no module that imports server-only', () => {
    expect(serverOnlyChains(SEED)).toEqual([]);
  });
});
