import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = 'http://127.0.0.1:4173/';
const outDir = path.resolve('artifacts', 'qa-headless');
fs.mkdirSync(outDir, { recursive: true });

const evidence = {
  base,
  startedAt: new Date().toISOString(),
  bookingCalls: [],
  scenarios: []
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

page.on('response', async (resp) => {
  const url = resp.url();
  if (!url.includes('/functions/v1/booking')) return;
  let body = '';
  try { body = await resp.text(); } catch {}
  evidence.bookingCalls.push({
    url,
    status: resp.status(),
    bodyPreview: body.slice(0, 500)
  });
});

async function markScenario(name, run) {
  const item = { name, status: 'FAIL', details: '', screenshot: '' };
  try {
    await run(item);
  } catch (e) {
    item.details = String(e?.message || e);
  }
  evidence.scenarios.push(item);
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(outDir, '00-home.png'), fullPage: true });

await markScenario('flights_search', async (s) => {
  await page.fill('#flight-origin', 'CAI');
  await page.fill('#flight-destination', 'DXB');
  await page.fill('input[type="date"]:near(:text("Departure"))', '2026-08-01');
  await page.fill('input[type="date"]:near(:text("Return"))', '2026-08-10');
  await page.click('button:has-text("Search flights")');
  await page.waitForTimeout(7000);
  const err = page.locator('div.border-rose-200').first();
  const cards = page.locator('div.border.border-slate-200.bg-white.text-slate-900');
  const errCount = await err.count();
  const cardCount = await cards.count();
  if (cardCount > 0) {
    s.status = 'PASS';
    s.details = `results=${cardCount}`;
  } else {
    const msg = errCount ? await err.textContent() : 'no cards/no explicit error';
    s.status = 'FAIL';
    s.details = `results=0 error=${(msg || '').trim()}`;
  }
  s.screenshot = path.join(outDir, '01-flights.png');
  await page.screenshot({ path: s.screenshot, fullPage: true });
});

await markScenario('hotels_search', async (s) => {
  await page.click('button[role="tab"]:has-text("Hotels")');
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-08-05');
  await dateInputs.nth(1).fill('2026-08-08');
  await page.click('button:has-text("Search hotels")');
  await page.waitForTimeout(7000);
  const err = page.locator('div.border-rose-200').first();
  const cards = page.locator('div.border.border-slate-200.bg-white.text-slate-900');
  const errCount = await err.count();
  const cardCount = await cards.count();
  if (cardCount > 0) {
    s.status = 'PASS';
    s.details = `results=${cardCount}`;
  } else {
    const msg = errCount ? await err.textContent() : 'no cards/no explicit error';
    s.status = 'FAIL';
    s.details = `results=0 error=${(msg || '').trim()}`;
  }
  s.screenshot = path.join(outDir, '02-hotels.png');
  await page.screenshot({ path: s.screenshot, fullPage: true });
});

await markScenario('cars_search', async (s) => {
  await page.click('button[role="tab"]:has-text("Cars")');
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-08-05');
  await dateInputs.nth(1).fill('2026-08-09');
  await page.click('button:has-text("Search cars")');
  await page.waitForTimeout(7000);
  const err = page.locator('div.border-rose-200').first();
  const cards = page.locator('div.border.border-slate-200.bg-white.text-slate-900');
  const errCount = await err.count();
  const cardCount = await cards.count();
  if (cardCount > 0) {
    s.status = 'PASS';
    s.details = `results=${cardCount}`;
  } else {
    const msg = errCount ? await err.textContent() : 'no cards/no explicit error';
    s.status = 'FAIL';
    s.details = `results=0 error=${(msg || '').trim()}`;
  }
  s.screenshot = path.join(outDir, '03-cars.png');
  await page.screenshot({ path: s.screenshot, fullPage: true });
});

evidence.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outDir, 'qa-results.json'), JSON.stringify(evidence, null, 2));

await browser.close();
console.log(JSON.stringify({ outDir, scenarios: evidence.scenarios, bookingCalls: evidence.bookingCalls.length }, null, 2));
