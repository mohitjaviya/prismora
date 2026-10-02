import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const env = {};
for (const line of readFileSync('D:/PRISMORA/.env.test-accounts.local', 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
export const BASE = process.env.BASE || 'https://prismora-henna.vercel.app';
export const E = env;
export const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
export async function login(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="password"]', { timeout: 20000 });
  await page.fill('input[type="email"], input[name="email"], input[type="text"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  return page;
}
export const settle = async (page) => { await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), null, { timeout: 40000 }).catch(() => {}); await page.waitForTimeout(2500); };
export const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await settle(page); };
