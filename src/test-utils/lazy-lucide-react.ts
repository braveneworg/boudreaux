/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import createLucideIcon from 'lucide-react/dist/esm/createLucideIcon.js';

import type { IconNode, LucideIcon } from 'lucide-react';

/**
 * A lazy stand-in for the `lucide-react` module, installed globally by
 * `setupTests.ts` via `vi.mock('lucide-react', ...)`.
 *
 * The real barrel defines ~1,600 icons (each a `forwardRef` component) at
 * import time; under the `vmThreads` pool every spec file that reaches it
 * re-evaluates all of them — ~33ms per file across ~180 files. This shim reads
 * the barrel's export map as text instead, and builds an icon only when a
 * spec's component first renders it, from the icon's own ESM file and the same
 * `createLucideIcon` factory the real package uses. The rendered SVG is
 * identical (see `lazy-lucide-react.spec.tsx`).
 *
 * Only the PascalCase icon exports are served. Anything else (`icons`,
 * `createLucideIcon`, `DynamicIcon`) is reported absent, so an accidental
 * import fails with Vitest's usual "No export is defined on the mock" error
 * rather than silently returning undefined.
 */
export type LazyLucideReact = Record<string, LucideIcon>;

const require = createRequire(import.meta.url);
const ESM_DIR = join(dirname(require.resolve('lucide-react/package.json')), 'dist', 'esm');

const EXPORT_LINE = /^export \{([^}]+)\} from '\.\/icons\/([a-z0-9-]+)\.js';$/gm;
const EXPORT_NAME = /default as ([A-Za-z0-9_]+)/g;
// Single-element trees are emitted on one line, larger ones across many; the
// first `];` is the end of the literal either way.
const ICON_NODE = /const __iconNode = (\[[\s\S]*?\]);/;
const UNQUOTED_KEY = /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*):/g;

/** PascalCase export name → kebab-case icon file stem, parsed from the barrel. */
const readExportMap = (): Map<string, string> => {
  const barrel = readFileSync(join(ESM_DIR, 'lucide-react.js'), 'utf8');
  const map = new Map<string, string>();
  for (const [, names, stem] of barrel.matchAll(EXPORT_LINE)) {
    for (const [, name] of names.matchAll(EXPORT_NAME)) {
      map.set(name, stem);
    }
  }
  return map;
};

/** The icon's node tree, parsed from its ESM file's `__iconNode` literal. */
const readIconNode = (stem: string): IconNode => {
  const source = readFileSync(join(ESM_DIR, 'icons', `${stem}.js`), 'utf8');
  const literal = ICON_NODE.exec(source)?.[1];
  if (literal === undefined) {
    throw new Error(`lazy-lucide-react: no __iconNode literal in icons/${stem}.js`);
  }
  return JSON.parse(literal.replace(UNQUOTED_KEY, '$1"$2":')) as IconNode;
};

export const createLazyLucideReact = (): LazyLucideReact => {
  const exportMap = readExportMap();
  // Keyed by file stem so every alias of an icon shares one component identity.
  const built = new Map<string, LucideIcon>();

  const icon = (name: string): LucideIcon | undefined => {
    const stem = exportMap.get(name);
    if (stem === undefined) {
      return undefined;
    }
    const cached = built.get(stem);
    if (cached !== undefined) {
      return cached;
    }
    const component = createLucideIcon(stem, readIconNode(stem));
    built.set(stem, component);
    return component;
  };

  return new Proxy<LazyLucideReact>(
    {},
    {
      has: (_target, prop) => typeof prop === 'string' && exportMap.has(prop),
      get: (_target, prop) => (typeof prop === 'string' ? icon(prop) : undefined),
      ownKeys: () => [...new Set(exportMap.keys())],
      getOwnPropertyDescriptor: (_target, prop) =>
        typeof prop === 'string' && exportMap.has(prop)
          ? { configurable: true, enumerable: true, value: icon(prop), writable: false }
          : undefined,
    }
  );
};
