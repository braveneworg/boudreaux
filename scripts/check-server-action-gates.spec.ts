/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { checkServerActionGates } from './check-server-action-gates';

const REPO_ROOT = join(__dirname, '..');

/** A throwaway project tree: relative path -> file contents. */
type Tree = Record<string, string>;

const HEADER = '/* MPL header */\n';

const serverModule = (body: string, marker?: string): string =>
  `${HEADER}'use server';\n${marker === undefined ? '' : `${marker}\n`}\n${body}`;

const ADMIN_ACTION = serverModule(
  "import { gateAction } from '@/lib/auth/action-gate';\n\n" +
    'export interface ArchiveResult { success: boolean }\n\n' +
    "export const archiveAction = async () => {\n  const gate = await gateAction('admin');\n  return gate;\n};\n\n" +
    "export async function restoreAction() {\n  return gateAction('admin');\n}\n"
);

const SIGNED_IN_ACTION = serverModule(
  "export const updateProfileAction = async () => {\n  const gate = await gateAction('signed-in');\n  return gate;\n};\n"
);

const ENTITY_ACTION = serverModule(
  'export const deleteThingAction = async (id: string) =>\n  runAdminEntityAction({ id });\n'
);

const PUBLIC_ACTION = serverModule(
  'export const contactAction = async () => ({ success: true });\n',
  '// action-gate: public: the contact form takes guests'
);

const projectTree = (): Tree => ({
  'src/lib/actions/archive-action.ts': ADMIN_ACTION,
  'src/lib/actions/contact-action.ts': PUBLIC_ACTION,
  'src/lib/actions/delete-thing-action.ts': ENTITY_ACTION,
  'src/lib/actions/update-profile-action.ts': SIGNED_IN_ACTION,
  // Neither a spec nor a module without the directive is a Server Action module.
  'src/lib/actions/archive-action.spec.ts': serverModule('export const helper = () => 1;\n'),
  'src/lib/utils/format.ts': `${HEADER}export const format = (value: string) => value;\n`,
});

let root = '';

const writeFile = (relativePath: string, contents: string): void => {
  const target = join(root, relativePath);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'server-action-gates-'));
  Object.entries(projectTree()).forEach(([relativePath, contents]) =>
    writeFile(relativePath, contents)
  );
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('checkServerActionGates', () => {
  it('classifies every export of every Server Action module by the gate it crosses', () => {
    expect(checkServerActionGates(root).exports).toEqual([
      { file: 'src/lib/actions/archive-action.ts', name: 'archiveAction', access: 'admin' },
      { file: 'src/lib/actions/archive-action.ts', name: 'restoreAction', access: 'admin' },
      { file: 'src/lib/actions/contact-action.ts', name: 'contactAction', access: 'public' },
      {
        file: 'src/lib/actions/delete-thing-action.ts',
        name: 'deleteThingAction',
        access: 'admin',
      },
      {
        file: 'src/lib/actions/update-profile-action.ts',
        name: 'updateProfileAction',
        access: 'signed-in',
      },
    ]);
  });

  it('reports nothing when every export is gated or its module is marked public', () => {
    expect(checkServerActionGates(root).violations).toEqual([]);
  });

  it('flags an export with no gate call in an unmarked module', () => {
    writeFile(
      'src/lib/actions/leaky-action.ts',
      serverModule('export const leakyAction = async () => ({ success: true });\n')
    );

    const { exports, violations } = checkServerActionGates(root);

    expect(exports).toContainEqual({
      file: 'src/lib/actions/leaky-action.ts',
      name: 'leakyAction',
      access: 'ungated',
    });
    expect(violations).toEqual([
      'src/lib/actions/leaky-action.ts: leakyAction calls neither gateAction nor runAdminEntityAction in its own body, and the module is not marked public',
    ]);
  });

  it('flags a module marked public that calls the gate', () => {
    writeFile(
      'src/lib/actions/confused-action.ts',
      serverModule(
        "export const confusedAction = async () => gateAction('admin');\n",
        '// action-gate: public: guests may call it'
      )
    );

    expect(checkServerActionGates(root).violations).toEqual([
      'src/lib/actions/confused-action.ts: a module marked public must not call gateAction or runAdminEntityAction',
    ]);
  });

  it('flags a public marker with an empty reason', () => {
    writeFile(
      'src/lib/actions/unexplained-action.ts',
      serverModule(
        'export const unexplainedAction = async () => ({ success: true });\n',
        '// action-gate: public:   '
      )
    );

    expect(checkServerActionGates(root).violations).toEqual([
      'src/lib/actions/unexplained-action.ts: the action-gate public marker needs a reason',
    ]);
  });

  it('flags an export whose only gate call is in a module-private helper', () => {
    writeFile(
      'src/lib/actions/indirect-action.ts',
      serverModule(
        "const requireAdmin = async () => gateAction('admin');\n\n" +
          'export const indirectAction = async () => {\n  await requireAdmin();\n};\n'
      )
    );

    expect(checkServerActionGates(root).violations).toEqual([
      'src/lib/actions/indirect-action.ts: indirectAction calls neither gateAction nor runAdminEntityAction in its own body, and the module is not marked public',
    ]);
  });

  it('flags an export list it cannot classify', () => {
    writeFile(
      'src/lib/actions/listed-action.ts',
      serverModule(
        "const listedAction = async () => gateAction('admin');\n\nexport { listedAction };\n"
      )
    );

    expect(checkServerActionGates(root).violations).toEqual([
      'src/lib/actions/listed-action.ts: export each Server Action as a declaration (`export const` or `export async function`), not through an export list or default export',
    ]);
  });

  it('flags an export that crosses the gate at two access levels', () => {
    writeFile(
      'src/lib/actions/two-level-action.ts',
      serverModule(
        'export const twoLevelAction = async (asAdmin: boolean) =>\n' +
          "  asAdmin ? gateAction('admin') : gateAction('signed-in');\n"
      )
    );

    expect(checkServerActionGates(root).violations).toEqual([
      'src/lib/actions/two-level-action.ts: twoLevelAction crosses the gate at more than one access level',
    ]);
  });

  it('flags a gate call whose access is not a string literal', () => {
    writeFile(
      'src/lib/actions/dynamic-action.ts',
      serverModule(
        "const access = 'admin' as const;\n\n" +
          'export const dynamicAction = async () => gateAction(access);\n'
      )
    );

    expect(checkServerActionGates(root).violations).toEqual([
      "src/lib/actions/dynamic-action.ts: dynamicAction must call gateAction with 'admin' or 'signed-in' as a string literal",
    ]);
  });
});

describe('this repository', () => {
  const report = checkServerActionGates(REPO_ROOT);

  it('gates every Server Action or declares its module public', () => {
    expect(report.violations).toEqual([]);
  });

  it('declares exactly these modules public', () => {
    const publicModules = [
      ...new Set(
        report.exports.filter(({ access }) => access === 'public').map(({ file }) => file)
      ),
    ].sort();

    expect(publicModules).toEqual([
      'src/lib/actions/check-guest-purchase-action.ts',
      'src/lib/actions/confirm-turnstile-action.ts',
      'src/lib/actions/contact-action.ts',
      'src/lib/actions/create-purchase-checkout-session-action.ts',
      'src/lib/actions/create-purchase-session-action.ts',
      'src/lib/actions/get-featured-artists.ts',
      'src/lib/actions/signin-action.ts',
      'src/lib/actions/signup-action.ts',
      'src/lib/actions/stash-signup-consent-action.ts',
      'src/lib/utils/verify-turnstile.ts',
    ]);
  });

  it('gates exactly these exports as signed-in', () => {
    const signedIn = report.exports
      .filter(({ access }) => access === 'signed-in')
      .map(({ name }) => name)
      .sort();

    expect(signedIn).toEqual(
      [
        'addPlaylistItemAction',
        'changeEmailAction',
        'changeUsernameAction',
        'createPlaylistAction',
        'deletePlaylistAction',
        'generatePlaylistCoverUploadUrlsAction',
        'getCollectionAction',
        'removePlaylistItemAction',
        'reorderPlaylistItemsAction',
        'sendChatMessageAction',
        'submitAbuseReportAction',
        'toggleChatReactionAction',
        'updatePlaylistAction',
        'updateProfileAction',
      ].sort()
    );
  });
});
