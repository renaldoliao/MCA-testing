// Builds public/dashboard/index.html from dashboard-src/index.html and the website's menu data,
// so the dashboard and the website always list the same dishes, names and prices.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function buildDashboard() {
  const menu = readFileSync(resolve(root, 'src/data/menu.json'), 'utf8');
  const src = readFileSync(resolve(root, 'dashboard-src/index.html'), 'utf8');
  if (!src.includes('/*__SITE_MENU__*/null')) throw new Error('dashboard-src is missing the menu placeholder');
  const body = src.replace('/*__SITE_MENU__*/null', JSON.stringify(JSON.parse(menu)).replace(/</g, '\\u003c'));
  const cleaned = body.replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '');
  const at = cleaned.indexOf('</style>') + '</style>'.length;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${cleaned.slice(0, at)}\n</head>\n<body>${cleaned.slice(at)}\n</body>\n</html>\n`;
}
export function writeDashboard() {
  const out = resolve(root, 'public/dashboard/index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buildDashboard());
  return out;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('wrote', writeDashboard());
