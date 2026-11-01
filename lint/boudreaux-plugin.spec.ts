/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const PLUGIN = resolve(__dirname, 'boudreaux-plugin.mjs');
const OXLINT = resolve(__dirname, '..', 'node_modules', '.bin', 'oxlint');
const RULE = 'no-component-return-type';
const RULE_TAG = `boudreaux(${RULE})`;

interface LintRun {
  status: number;
  /** Diagnostic lines in oxlint's unix format: `file:line:col: message [Severity/scope(rule)]`. */
  diagnostics: string[];
  output: string;
}

/**
 * Lints `source` as a `.tsx` file in a throwaway directory whose only enabled
 * rule is the local one, so native rules cannot add noise. Returns the parsed
 * diagnostics and, after `--fix`, the rewritten file contents.
 */
const lint = (source: string, { fix = false } = {}): LintRun & { fixed: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'boudreaux-plugin-'));

  try {
    const file = join(dir, 'fixture.tsx');
    writeFileSync(file, source);
    writeFileSync(
      join(dir, '.oxlintrc.json'),
      JSON.stringify({
        plugins: [],
        categories: { correctness: 'off' },
        jsPlugins: [{ name: 'boudreaux', specifier: PLUGIN }],
        rules: { [`boudreaux/${RULE}`]: 'error' },
      })
    );

    const args = [
      '-c',
      join(dir, '.oxlintrc.json'),
      '--format=unix',
      ...(fix ? ['--fix'] : []),
      file,
    ];
    const result = spawnSync(OXLINT, args, { cwd: dir, encoding: 'utf8' });
    const output = `${result.stdout}${result.stderr}`;
    const diagnostics = output
      .split('\n')
      .filter((line) => /^.+:\d+:\d+: .* \[(Error|Warning)\/.+\]$/.test(line));

    return { status: result.status ?? -1, diagnostics, output, fixed: readFileSync(file, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const ANNOTATED_COMPONENTS = `import type { JSX, ReactElement, ReactNode } from 'react';

export const Card = ({ title }: { title: string }): ReactElement => <div>{title}</div>;
export const Maybe = (): ReactElement | null => null;
export const Nodes = (): React.ReactNode[] => [];
export const Fragmentary = (): ReactNode => null;
export const Legacy = function Legacy(): JSX.Element {
  return <div />;
};
export default async function Page(): Promise<JSX.Element> {
  return <div />;
}
export function NotFound(): React.JSX.Element {
  return <div />;
}
`;

const INFERRED_COMPONENTS = `export const Card = ({ title }: { title: string }) => <div>{title}</div>;
export const Maybe = () => null;
export default async function Page() {
  return <div />;
}
export function NotFound() {
  return <div />;
}
`;

const LEFT_ALONE = `import type { Metadata } from 'next';
import type { ReactElement } from 'react';

export const useThing = (): boolean => true;
const toLabel = (n: number): string => \`\${n}\`;
export const Redirecting = (): never => {
  throw new Error('redirect');
};
export const metadata: Metadata = { title: 'x' };
export const renderRows = (items: string[]): ReactElement[] => items.map((i) => <li key={i}>{i}</li>);
export const makeIcon = (): ((size: number) => ReactElement) => (size) => <svg width={size} />;
export const Status = ({ ok }: { ok: boolean }): 'ok' | 'ko' => (ok ? 'ok' : 'ko');
`;

describe(`boudreaux/${RULE}`, () => {
  it('loads as an oxlint JS plugin', () => {
    const { status, output } = lint('export const x = 1;\n');

    expect(output).not.toMatch(/Failed to load|Cannot find|SyntaxError/);
    expect(status).toBe(0);
  });

  it('flags every PascalCase function annotated with a React element type', () => {
    const { status, diagnostics } = lint(ANNOTATED_COMPONENTS);

    expect(status).not.toBe(0);
    expect(diagnostics).toHaveLength(7);
    for (const line of diagnostics) {
      expect(line).toContain(RULE_TAG);
    }
    expect(diagnostics.map((line) => Number(line.split(':')[1]))).toEqual([3, 4, 5, 6, 7, 10, 13]);
  });

  it('leaves hooks, utilities, non-React return types and typed values alone', () => {
    const { status, diagnostics } = lint(LEFT_ALONE);

    expect(diagnostics).toEqual([]);
    expect(status).toBe(0);
  });

  it('accepts components whose return type is inferred', () => {
    const { status, diagnostics } = lint(INFERRED_COMPONENTS);

    expect(diagnostics).toEqual([]);
    expect(status).toBe(0);
  });

  it('removes the annotation with --fix and leaves the signature well-formed', () => {
    const { fixed } = lint(ANNOTATED_COMPONENTS, { fix: true });

    expect(fixed).toBe(`import type { JSX, ReactElement, ReactNode } from 'react';

export const Card = ({ title }: { title: string }) => <div>{title}</div>;
export const Maybe = () => null;
export const Nodes = () => [];
export const Fragmentary = () => null;
export const Legacy = function Legacy() {
  return <div />;
};
export default async function Page() {
  return <div />;
}
export function NotFound() {
  return <div />;
}
`);
    expect(lint(fixed).diagnostics).toEqual([]);
  });
});
