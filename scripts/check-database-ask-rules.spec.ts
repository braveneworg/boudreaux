/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import {
  findDatabaseWritingFiles,
  findMissingAskRules,
  matchesAskRule,
  requiredAskCommands,
} from './check-database-ask-rules';

const REPO_ROOT = join(__dirname, '..');

/** A throwaway project tree: relative path -> file contents. */
type Tree = Record<string, string>;

const PRISMA_WRITE =
  "import { PrismaClient } from '@prisma/client';\nawait prisma.release.updateMany({ data: {} });\n";
const PRISMA_READ =
  "import { PrismaClient } from '@prisma/client';\nawait prisma.release.findMany();\n";
const HASH_ONLY = "import { createHash } from 'crypto';\ncreateHash('sha256').update('x');\n";

const COMPLETE_RULES = [
  'Bash(pnpm run dev *)',
  'Bash(pnpm dev *)',
  'Bash(pnpm run db:push *)',
  'Bash(pnpm db:push *)',
  'Bash(pnpm run seed *)',
  'Bash(pnpm seed *)',
  'Bash(tsx prisma/seed.ts *)',
  'Bash(pnpm exec tsx prisma/seed.ts *)',
  'Bash(tsx scripts/migrate-*)',
  'Bash(pnpm exec tsx scripts/migrate-*)',
];

const settingsJson = (askRules: string[]): string =>
  JSON.stringify({ permissions: { ask: askRules } });

const projectTree = (): Tree => ({
  '.claude/settings.json': settingsJson(COMPLETE_RULES),
  'package.json': JSON.stringify({
    scripts: {
      build: 'next build',
      'db:push': 'prisma db push',
      dev: 'next dev --turbopack',
      'images:hash': 'pnpm exec tsx scripts/hash-images.ts',
      'report:read': 'pnpm exec tsx scripts/read-report.ts',
      seed: 'tsx prisma/seed.ts',
    },
  }),
  'prisma/seed.ts': PRISMA_WRITE,
  'scripts/hash-images.ts': HASH_ONLY,
  'scripts/migrate-releases.spec.ts': PRISMA_WRITE,
  'scripts/migrate-releases.ts': PRISMA_WRITE,
  'scripts/read-report.ts': PRISMA_READ,
});

let root = '';

const writeFile = (relativePath: string, contents: string): void => {
  const target = join(root, relativePath);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'database-ask-rules-'));
  Object.entries(projectTree()).forEach(([relativePath, contents]) =>
    writeFile(relativePath, contents)
  );
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('findDatabaseWritingFiles', () => {
  it('finds scripts that load a database client and write through it', () => {
    expect(findDatabaseWritingFiles(root)).toEqual([
      'prisma/seed.ts',
      'scripts/migrate-releases.ts',
    ]);
  });
});

describe('requiredAskCommands', () => {
  it('requires direct tsx runs of database-writing files and package scripts that change data', () => {
    expect(requiredAskCommands(root)).toEqual([
      'pnpm db:push',
      'pnpm dev',
      'pnpm exec tsx prisma/seed.ts',
      'pnpm exec tsx scripts/migrate-releases.ts',
      'pnpm run db:push',
      'pnpm run dev',
      'pnpm run seed',
      'pnpm seed',
      'tsx prisma/seed.ts',
      'tsx scripts/migrate-releases.ts',
    ]);
  });
});

describe('matchesAskRule', () => {
  it.each([
    ['Bash(pnpm run seed *)', 'pnpm run seed'],
    ['Bash(pnpm run seed *)', 'pnpm run seed --reset'],
    ['Bash(tsx scripts/migrate-*)', 'tsx scripts/migrate-releases.ts'],
    ['Bash(pnpm exec prisma db *)', 'pnpm exec prisma db push'],
  ])('%s matches %j', (rule, command) => {
    expect(matchesAskRule(rule, command)).toBe(true);
  });

  it.each([
    ['Bash(pnpm run seed *)', 'pnpm run seeds'],
    ['Bash(tsx scripts/migrate-*)', 'tsx scripts/other.ts'],
    ['Read(.env)', 'cat .env'],
  ])('%s does not match %j', (rule, command) => {
    expect(matchesAskRule(rule, command)).toBe(false);
  });
});

describe('findMissingAskRules', () => {
  it('reports nothing when every required command has an ask rule', () => {
    expect(findMissingAskRules(root)).toEqual([]);
  });

  it('reports required commands that no ask rule matches', () => {
    writeFile(
      '.claude/settings.json',
      settingsJson(COMPLETE_RULES.filter((rule) => !rule.includes('migrate')))
    );

    expect(findMissingAskRules(root)).toEqual([
      'pnpm exec tsx scripts/migrate-releases.ts',
      'tsx scripts/migrate-releases.ts',
    ]);
  });
});

describe('this repository', () => {
  it('has an ask rule for every command that can write to the database', () => {
    expect(findMissingAskRules(REPO_ROOT)).toEqual([]);
  });
});
