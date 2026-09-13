/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Keeps the `.claude/settings.json` ask rules in step with the commands that
 * can write to a database. Worktrees carry the real env files, so a new
 * write-capable script must prompt for approval before it can reach the live
 * database; the adjacent spec fails the gate when a required command has no
 * matching rule.
 *
 * Detection is a heuristic over the script's own source: it needs both a
 * database client (Prisma, the app's data layer, the Mongo driver) and a write
 * call. Writes buried in imported modules the script never names are missed.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SCRIPT_DIRECTORIES = ['prisma', 'scripts'];
const SCRIPT_FILE = /\.(?:m?js|ts)$/;
const SPEC_FILE = /\.spec\.(?:m?js|ts)$/;
/** Source that loads a database client or the app's data layer. */
const DATABASE_CLIENT =
  /PrismaClient|@prisma\/client|@\/lib\/prisma|@\/lib\/repositories\/|@\/lib\/services\/|MongoClient|mongorestore|DATABASE_URL/;
/** Calls that change data through Prisma, a repository or service, or the Mongo driver. */
const DATABASE_WRITE =
  /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany|insertOne|insertMany|updateOne|replaceOne|deleteOne|bulkWrite|drop)\(|\$(?:executeRaw|runCommandRaw)|mongorestore/;
/** Package-script bodies that change data without naming a script file. */
const DATA_COMMAND = /\bprisma\s+(?:db|migrate|studio)\b|\bnext\s+(?:dev|start)\b/;
const SCRIPT_REFERENCE = /(?:prisma|scripts)\/[\w./-]+\.(?:m?js|ts)/g;
const TSX_RUNNERS = ['tsx', 'pnpm exec tsx'];
const BASH_RULE = /^Bash\((.*)\)$/;
const BARE_COMMAND_SUFFIX = ' *';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readText = (path: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const readJson = (path: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

    return parsed;
  } catch {
    return null;
  }
};

/** This checker's own patterns name database clients and write calls, so it skips itself. */
const CHECKER_FILE = 'scripts/check-database-ask-rules.ts';

const listScriptFiles = (root: string): string[] =>
  SCRIPT_DIRECTORIES.flatMap((directory) => {
    try {
      return readdirSync(join(root, directory), { encoding: 'utf8', recursive: true }).map(
        (entry) => `${directory}/${entry}`
      );
    } catch {
      return [];
    }
  }).filter((path) => SCRIPT_FILE.test(path) && !SPEC_FILE.test(path) && path !== CHECKER_FILE);

/**
 * Repo-relative script files under `prisma/` and `scripts/` that load a
 * database client and write through it, sorted.
 */
export const findDatabaseWritingFiles = (root: string): string[] =>
  listScriptFiles(root)
    .filter((path) => {
      const source = readText(join(root, path));

      return DATABASE_CLIENT.test(source) && DATABASE_WRITE.test(source);
    })
    .sort();

const packageScripts = (root: string): Array<[string, string]> => {
  const manifest = readJson(join(root, 'package.json'));
  const scripts = isRecord(manifest) ? manifest.scripts : undefined;

  if (!isRecord(scripts)) {
    return [];
  }

  return Object.entries(scripts).flatMap(([name, body]): Array<[string, string]> =>
    typeof body === 'string' ? [[name, body]] : []
  );
};

const changesData = (body: string, writingFiles: ReadonlySet<string>): boolean =>
  DATA_COMMAND.test(body) ||
  (body.match(SCRIPT_REFERENCE) ?? []).some((path) => writingFiles.has(path));

/**
 * Every command that must trigger an ask rule, sorted: direct `tsx` runs of
 * database-writing files, and the `pnpm` forms of package scripts that change
 * data (Prisma data commands, Next.js servers, or a database-writing file).
 */
export const requiredAskCommands = (root: string): string[] => {
  const writingFiles = findDatabaseWritingFiles(root);
  const writingSet = new Set(writingFiles);
  const fileCommands = writingFiles.flatMap((path) =>
    TSX_RUNNERS.map((runner) => `${runner} ${path}`)
  );
  const scriptCommands = packageScripts(root)
    .filter(([, body]) => changesData(body, writingSet))
    .flatMap(([name]) => [`pnpm run ${name}`, `pnpm ${name}`]);

  return [...fileCommands, ...scriptCommands].sort();
};

/** `*`-only glob match: every literal part must appear in order, anchored at both ends. */
const globMatches = (glob: string, text: string): boolean => {
  const [first = '', ...rest] = glob.split('*');

  if (rest.length === 0) {
    return text === first;
  }

  if (!text.startsWith(first)) {
    return false;
  }

  const last = rest.at(-1) ?? '';
  const end = rest.slice(0, -1).reduce((position, part) => {
    if (position === -1) {
      return -1;
    }

    const index = text.indexOf(part, position);

    return index === -1 ? -1 : index + part.length;
  }, first.length);

  return end !== -1 && text.length - last.length >= end && text.endsWith(last);
};

/**
 * Whether a permission rule matches `command` under the documented Bash rule
 * syntax: `*` matches any characters, and a trailing ` *` also matches the
 * bare command. Non-Bash rules never match.
 */
export const matchesAskRule = (rule: string, command: string): boolean => {
  const pattern = BASH_RULE.exec(rule)?.[1];

  if (pattern === undefined) {
    return false;
  }

  const bareCommand = pattern.endsWith(BARE_COMMAND_SUFFIX)
    ? pattern.slice(0, -BARE_COMMAND_SUFFIX.length)
    : null;

  return globMatches(pattern, command) || command === bareCommand;
};

const askRules = (root: string): string[] => {
  const settings = readJson(join(root, '.claude', 'settings.json'));
  const permissions = isRecord(settings) ? settings.permissions : undefined;
  const ask: unknown = isRecord(permissions) ? permissions.ask : undefined;

  return Array.isArray(ask)
    ? ask.filter((rule: unknown): rule is string => typeof rule === 'string')
    : [];
};

/** Required commands that no ask rule in `.claude/settings.json` matches, sorted. */
export const findMissingAskRules = (root: string): string[] => {
  const rules = askRules(root);

  return requiredAskCommands(root).filter(
    (command) => !rules.some((rule) => matchesAskRule(rule, command))
  );
};
