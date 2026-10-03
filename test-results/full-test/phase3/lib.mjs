import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const env = {};
for (const line of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
export const BASE = process.env.BASE || 'http://localhost:5174';
export const E = env;
export const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: (process.env.CHROME_ARGS || '').split(' ').filter(Boolean) });
// Request interception (page.route) makes every matching request wait for this Node process.
// A synchronous DB check (execSync) while it is on freezes those requests (batch 14: 7 s and 38 s).
// Rule: never pause for a DB check while interception is on. Scripts' db() helpers call
// assertNotIntercepting() first; unrouteAll() before checking the DB.
// Also (batch 14 root cause of "slow saves"): on this network the HTTP/3 (QUIC) connection to
// Supabase dies after a few idle seconds, and the next request stalls ~7 s (up to 40 s) before
// Chrome falls back to HTTP/2. A DB-check pause is such an idle gap. To test the app rather than
// the network, run with CHROME_ARGS=--disable-quic; leave it off to see what users see.
const intercepting = new Set();
export function assertNotIntercepting() {
  if (intercepting.size) throw new Error('DB check while request interception is on: call page.unrouteAll() first (it would freeze the page\'s requests)');
}
export async function login(role) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const route = page.route.bind(page), unrouteAll = page.unrouteAll.bind(page);
  page.route = async (...a) => { intercepting.add(page); return route(...a); };
  page.unrouteAll = async (...a) => { const r = await unrouteAll(...a); intercepting.delete(page); return r; };
  ctx.on('close', () => intercepting.delete(page));
  page.problems = []; page.dialogs = [];
  page.on('dialog', d => { page.dialogs.push(d.type() + ': ' + d.message().slice(0, 120)); d.type() === 'beforeunload' ? d.accept() : d.dismiss().catch(() => {}); });
  page.on('pageerror', e => page.problems.push('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') page.problems.push('CONSOLE ' + m.text().slice(0, 200)); });
  page.on('requestfailed', r => page.problems.push('REQFAIL ' + r.failure()?.errorText + ' ' + r.url().slice(0, 120)));
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) page.problems.push('HTTP ' + r.status() + ' ' + r.request().method() + ' ' + r.url().replace(/\?.*/, '').slice(-90)); });
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="password"]', { timeout: 20000 });
  await page.fill('input[type="email"], input[name="email"], input[type="text"]', env[`TEST_${role}_EMAIL`]);
  await page.fill('input[type="password"]', env[`TEST_${role}_PASSWORD`]);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  return page;
}
export const settle = async (page) => { await page.waitForFunction(() => !/Loading(\.\.\.|…)/.test(document.body.innerText) && document.body.innerText.length > 50, null, { timeout: 40000 }).catch(() => {}); await page.waitForTimeout(2000); };
export const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await settle(page); };
export const modalOpen = (page) => page.locator('.fixed.inset-0').count();
