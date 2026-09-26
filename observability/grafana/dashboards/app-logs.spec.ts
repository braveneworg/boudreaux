/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard for the provisioned "Application Logs" dashboard. Grafana loads it
 * from disk on the prod box and nothing in CI renders it, so a broken JSON
 * file or a query that never matches an nginx access-log line would only be
 * noticed the day someone needs the panel (issue #766, ADR-0013).
 */

interface DashboardTarget {
  expr: string;
  legendFormat?: string;
  refId: string;
}

interface GridPos {
  h: number;
  w: number;
  x: number;
  y: number;
}

interface DashboardPanel {
  gridPos: GridPos;
  id: number;
  targets?: DashboardTarget[];
  title: string;
  type: string;
}

interface Dashboard {
  panels: DashboardPanel[];
}

const DASHBOARD_PATH = join(__dirname, 'app-logs.json');
const DASHBOARD = JSON.parse(readFileSync(DASHBOARD_PATH, 'utf8')) as Dashboard;

const NGINX_429_PANEL_TITLE = 'nginx 429s by path prefix (5m)';

/** Sample lines in the `main_reqid` log_format from nginx/nginx.conf. */
const accessLine = (request: string, status: number): string =>
  `203.0.113.7 - - [26/Sep/2026:12:00:00 +0000] "${request}" ${status} 512 "-" "Mozilla/5.0" reqid=abc123`;

const findPanel = (title: string): DashboardPanel | undefined =>
  DASHBOARD.panels.find((panel) => panel.title === title);

const nginx429Expr = (): string => findPanel(NGINX_429_PANEL_TITLE)?.targets?.[0]?.expr ?? '';

/** The backtick-quoted operand that follows `operator` in a LogQL expression. */
const operand = (expr: string, operator: string): string =>
  new RegExp(`${operator.replace(/[|~]/g, '\\$&')} \`([^\`]*)\``).exec(expr)?.[1] ?? '';

/**
 * Apply the panel's line filter and `regexp` stage to one line, as Loki would.
 * RE2's `(?P<name>…)` becomes JS's `(?<name>…)`; the patterns are otherwise
 * compatible, and both engines pick the leftmost alternative that matches.
 */
const prefixFor = (line: string): string | undefined => {
  const expr = nginx429Expr();
  const lineFilter = new RegExp(operand(expr, '|~'));
  const extractor = new RegExp(operand(expr, '| regexp').replace(/\(\?P</g, '(?<'));

  return lineFilter.test(line) ? extractor.exec(line)?.groups?.prefix : undefined;
};

describe('app-logs dashboard', () => {
  it('gives every panel a unique id', () => {
    const ids = DASHBOARD.panels.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lays out no two panels on the same grid cells', () => {
    const overlaps = DASHBOARD.panels.flatMap((a, index) =>
      DASHBOARD.panels
        .slice(index + 1)
        .filter(
          (b) =>
            a.gridPos.x < b.gridPos.x + b.gridPos.w &&
            b.gridPos.x < a.gridPos.x + a.gridPos.w &&
            a.gridPos.y < b.gridPos.y + b.gridPos.h &&
            b.gridPos.y < a.gridPos.y + a.gridPos.h
        )
        .map((b) => `${a.title} / ${b.title}`)
    );

    expect(overlaps).toEqual([]);
  });
});

describe('app-logs dashboard: nginx 429s by path prefix', () => {
  it('has a timeseries panel for nginx 429s', () => {
    expect(findPanel(NGINX_429_PANEL_TITLE)).toMatchObject({ type: 'timeseries' });
  });

  it('reads the nginx access log and sums by prefix over 5m', () => {
    const expr = nginx429Expr();

    expect(expr).toMatch(/^sum by \(prefix\) \(count_over_time\(\{container="nginx"\}/);
    expect(expr).toMatch(/\[5m\]\)\)$/);
  });

  it.each([
    ['GET /api/auth/get-session HTTP/2.0', '/api/auth/get-session'],
    ['GET /api/auth/callback/apple?code=x HTTP/2.0', '/api/auth'],
    ['GET /api/artists/64f0c0ffee/bio-generation HTTP/2.0', '/api/artists'],
    ['GET /api/releases?page=2 HTTP/1.1', '/api/releases'],
    ['POST /api/stripe/webhook HTTP/1.1', '/api/stripe'],
    ['GET /artists/some-slug HTTP/2.0', '/artists'],
    ['GET / HTTP/2.0', '/'],
  ])('buckets a 429 for "%s" under %s', (request, prefix) => {
    expect(prefixFor(accessLine(request, 429))).toBe(prefix);
  });

  it.each([200, 404, 503])('ignores a %i response', (status) => {
    expect(prefixFor(accessLine('GET /api/auth/get-session HTTP/2.0', status))).toBeUndefined();
  });
});
