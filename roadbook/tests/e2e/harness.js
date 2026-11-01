/* Mini-harness Playwright (o @playwright/test não está instalado; usa-se o playwright pré-instalado). */
'use strict';
const { chromium } = require('playwright');
const tests = [];
function test(name, fn, opts = {}) { tests.push({ name, fn, opts }); }
/* página com registo de erros da consola e de excepções */
async function openPage(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, colorScheme: opts.colorScheme || 'light', acceptDownloads: true, offline: !!opts.offline, ...(opts.ctx || {}) });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  return { ctx, page, errors };
}
async function run(filter) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const results = [];
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const t0 = Date.now();
    try { const info = await t.fn(browser); results.push({ name: t.name, ok: true, ms: Date.now() - t0, info: info || '' }); console.log('ok   ', t.name, info ? '· ' + info : ''); }
    catch (e) { results.push({ name: t.name, ok: false, ms: Date.now() - t0, error: String(e && e.stack || e) }); console.log('FALHA', t.name, '\n   ', String(e && e.message || e).split('\n').slice(0, 6).join('\n    ')); }
  }
  await browser.close();
  return results;
}
function assert(c, m) { if (!c) throw new Error(m || 'falhou'); }
module.exports = { test, run, openPage, assert };
