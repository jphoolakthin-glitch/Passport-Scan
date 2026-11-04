/**
 * Browser walk-through against dev/server.js (must be running):  node dev/e2e.js [screenshotDir]
 */
const { chromium } = require('playwright');
const assert = require('assert/strict');
const out = process.argv[2];
const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/google|gstatic/.test(m.location().url)) errors.push(m.text()); });
  await page.route(/accounts\.google\.com|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const shot = async (name) => out && page.screenshot({ path: `${out}/${name}.png`, fullPage: true });

  // 1. sign in: unregistered email is denied, owner gets in
  await page.goto(BASE);
  await page.fill('.dev-login input', 'stranger@gmail.com');
  await page.click('.dev-login button');
  await page.waitForSelector('#login-msg:not([hidden])');
  assert.match(await page.textContent('#login-msg'), /ยังไม่มีสิทธิ์เข้าใช้งาน/);
  await page.fill('.dev-login input', 'owner@example.com');
  await page.click('.dev-login button');
  await page.waitForSelector('.stats');
  await shot('1-dashboard');

  // 2. hotel search -> hotel page
  await page.click('#nav a[href="#/hotels"]');
  await page.fill('#q', 'chiang');
  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 1);
  await page.click('#list tbody tr');
  await page.waitForSelector('#head h1');
  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 4);

  // 3. add a device: validation error shown on the field, then saved
  await page.click('#add');
  await page.selectOption('select[name=type]', 'SCANNER');
  await page.fill('input[name=name]', 'Passport scanner 2');
  await page.fill('input[name=ip_address]', '999.1.1.1');
  await page.fill('input[name=license_expiry]', '2026-11-20');
  await page.click('button[value=save]');
  await page.waitForFunction(() => document.querySelector('[data-err=ip_address]').textContent !== '');
  assert.equal(await page.textContent('[data-err=license_name]'), 'ต้องระบุชื่อ License เมื่อกรอกวันหมดอายุ');
  await shot('2-validation');
  await page.fill('input[name=ip_address]', '192.168.1.50');
  await page.fill('input[name=license_name]', 'Scanner SDK');
  await page.click('button[value=save]');
  await page.waitForFunction(() => [...document.querySelectorAll('#list tbody tr')].length === 5);
  await page.click('.seg button[data-type=SCANNER]');
  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 2);
  await shot('3-hotel');

  // 4. edit it
  await page.click('#list tbody tr:has-text("Passport scanner 2")');
  await page.fill('input[name=location]', 'Lobby');
  await page.click('button[value=save]');
  await page.waitForFunction(() => !document.querySelector('#modal').open);

  // 5. alerts: run the check, acknowledge one
  await page.click('#nav a[href="#/alerts"]');
  await page.waitForSelector('#list tbody tr');
  await page.click('#run');
  await page.waitForFunction(() => /ใหม่ 1/.test(document.querySelector('#toast').textContent));
  const before = await page.locator('#list tbody tr').count();
  await page.click('#list [data-ack] >> nth=0');
  await page.waitForFunction((n) => document.querySelectorAll('#list tbody tr').length === n - 1, before);
  await shot('4-alerts');

  // 6. add an editor for one hotel
  await page.click('#nav a[href="#/users"]');
  await page.waitForFunction(() => /owner@example\.com/.test(document.querySelector('#list').textContent));
  await page.click('#add');
  await page.fill('#modal input[name=email]', 'staff@gmail.com');
  await page.fill('#modal input[name=name]', 'Front desk staff');
  await page.selectOption('select[name=role]', 'editor');
  await page.check('#hl label:has-text("Nimman") input');
  await shot('5-user-form');
  await page.click('button[value=save]');
  await page.waitForFunction(() => document.querySelectorAll('#list tbody tr').length === 2);

  // 7. audit log shows the edit with before -> after
  await page.click('#nav a[href="#/audit"]');
  await page.waitForFunction(() => /Lobby/.test(document.querySelector('#list').textContent));
  await shot('6-audit');

  // 8. sign in as the editor: only their hotel, no admin menus
  await page.click('#signout');
  await page.fill('.dev-login input', 'staff@gmail.com');
  await page.click('.dev-login button');
  await page.waitForSelector('.stats');
  assert.deepEqual(await page.locator('#nav a').allTextContents(), ['แดชบอร์ด', 'โรงแรม', 'การแจ้งเตือน']);
  assert.equal(await page.textContent('.stats .stat:nth-child(1) .value'), '1');
  await page.goto(BASE + '/#/users');
  await page.waitForFunction(() => location.hash === '#/dashboard');

  // 9. phone width
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(BASE + '/#/hotels');
  await page.waitForSelector('#list tbody tr');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'horizontal scroll at phone width');
  await shot('7-phone');

  assert.deepEqual(errors, []);
  console.log('E2E OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
