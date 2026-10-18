/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Proves that every Server Action crosses the action gate or says it is
 * public. Each export of every `'use server'` module under `<root>/src` must
 * call `gateAction('admin' | 'signed-in')` or `runAdminEntityAction(...)` in
 * its own body (a call inside a module-private helper does not count), unless
 * the line directly after `'use server';` is
 * `// action-gate: public: <reason>`. The adjacent spec fails the gate on any
 * violation and pins the public modules and signed-in exports.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import ts from 'typescript';

export type ServerActionAccess = 'admin' | 'signed-in' | 'public' | 'ungated';

export interface ServerActionExport {
  file: string;
  name: string;
  access: ServerActionAccess;
}

export interface ServerActionGateReport {
  exports: ServerActionExport[];
  violations: string[];
}

const SOURCE_FILE = /\.tsx?$/;
const SPEC_FILE = /\.spec\.tsx?$/;
const PUBLIC_MARKER = '// action-gate: public';
const GATE_ACCESS = new Set<string>(['admin', 'signed-in']);

/** What one export's own body reveals about its gate. */
interface GateCalls {
  access: Set<ServerActionAccess>;
  /** A `gateAction(...)` call whose argument is not an access string literal. */
  dynamic: boolean;
}

const listSourceFiles = (root: string): string[] => {
  try {
    return readdirSync(join(root, 'src'), { encoding: 'utf8', recursive: true })
      .map((entry) => `src/${entry}`)
      .filter((path) => SOURCE_FILE.test(path) && !SPEC_FILE.test(path))
      .sort();
  } catch {
    return [];
  }
};

const isUseServerDirective = (statement: ts.Statement | undefined): boolean =>
  statement !== undefined &&
  ts.isExpressionStatement(statement) &&
  ts.isStringLiteral(statement.expression) &&
  statement.expression.text === 'use server';

const hasExportModifier = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);

const calleeName = (call: ts.CallExpression): string | null =>
  ts.isIdentifier(call.expression) ? call.expression.text : null;

const gateCallsIn = (node: ts.Node): GateCalls => {
  const calls: GateCalls = { access: new Set(), dynamic: false };

  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      const name = calleeName(child);
      const [argument] = child.arguments;

      if (name === 'runAdminEntityAction') {
        calls.access.add('admin');
      } else if (name === 'gateAction') {
        if (
          argument !== undefined &&
          ts.isStringLiteralLike(argument) &&
          GATE_ACCESS.has(argument.text)
        ) {
          calls.access.add(argument.text === 'admin' ? 'admin' : 'signed-in');
        } else {
          calls.dynamic = true;
        }
      }
    }
    ts.forEachChild(child, visit);
  };

  visit(node);
  return calls;
};

/** Each exported declaration's name and the node holding its body. */
const exportedDeclarations = (statement: ts.Statement): Array<[string, ts.Node]> => {
  if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name) {
    return [[statement.name.text, statement]];
  }

  if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
    return statement.declarationList.declarations.flatMap(
      (declaration): Array<[string, ts.Node]> =>
        ts.isIdentifier(declaration.name) ? [[declaration.name.text, declaration]] : []
    );
  }

  return [];
};

/** `export { … }`, `export * from …` and `export default …` hide the body this check reads. */
const isOpaqueExport = (statement: ts.Statement): boolean =>
  (ts.isExportDeclaration(statement) && !statement.isTypeOnly) || ts.isExportAssignment(statement);

const checkModule = (path: string, source: string, report: ServerActionGateReport): void => {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const [directive] = sourceFile.statements;

  if (!isUseServerDirective(directive)) {
    return;
  }

  const markerLine = sourceFile.getLineAndCharacterOfPosition(directive.getEnd()).line + 1;
  const line = source.split('\n').at(markerLine) ?? '';
  const isPublic = line === PUBLIC_MARKER || line.startsWith(`${PUBLIC_MARKER}:`);

  if (isPublic && line.slice(PUBLIC_MARKER.length + 1).trim() === '') {
    report.violations.push(`${path}: the action-gate public marker needs a reason`);
  }

  if (isPublic && gateCallsIn(sourceFile).access.size > 0) {
    report.violations.push(
      `${path}: a module marked public must not call gateAction or runAdminEntityAction`
    );
  }

  if (sourceFile.statements.some(isOpaqueExport)) {
    report.violations.push(
      `${path}: export each Server Action as a declaration (\`export const\` or \`export async function\`), not through an export list or default export`
    );
  }

  sourceFile.statements.flatMap(exportedDeclarations).forEach(([name, body]) => {
    if (isPublic) {
      report.exports.push({ file: path, name, access: 'public' });
      return;
    }

    const { access, dynamic } = gateCallsIn(body);
    const [only] = access;

    if (dynamic) {
      report.violations.push(
        `${path}: ${name} must call gateAction with 'admin' or 'signed-in' as a string literal`
      );
    } else if (access.size === 0) {
      report.violations.push(
        `${path}: ${name} calls neither gateAction nor runAdminEntityAction in its own body, and the module is not marked public`
      );
    } else if (access.size > 1) {
      report.violations.push(`${path}: ${name} crosses the gate at more than one access level`);
    }

    report.exports.push({
      file: path,
      name,
      access: access.size === 1 && only !== undefined ? only : 'ungated',
    });
  });
};

/**
 * Classify every export of every `'use server'` module under `<root>/src` as
 * `admin`, `signed-in`, `public` or `ungated`, and list what breaks the rule.
 */
export const checkServerActionGates = (root: string): ServerActionGateReport => {
  const report: ServerActionGateReport = { exports: [], violations: [] };

  listSourceFiles(root).forEach((path) =>
    checkModule(path, readFileSync(join(root, path), 'utf8'), report)
  );

  return report;
};
