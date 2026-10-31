// Проверки сайта перед выкладкой: node tests/check.js
// Поднимает локальный сервер для public/, открывает страницы в Chromium и проверяет
// ключевые сценарии и доступность (axe). При любой ошибке завершается с кодом 1.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const VENDOR = path.join(__dirname, 'vendor');
const releases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'releases.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(PUB, p);
      if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        resp.writeHead(404, { 'content-type': TYPES['.html'] });
        return resp.end(fs.readFileSync(path.join(PUB, '404.html')));
      }
      resp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      resp.end(fs.readFileSync(f));
    }).listen(0, () => res(srv));
  });
}

async function page(browser, base, url, vp) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'ru-RU', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  // внешние сервисы недоступны в проверке: three.js берём локально, остальное отключаем
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/build\//, r => r.fulfill({ path: path.join(VENDOR, 'three.module.min.js'), contentType: 'text/javascript' }));
  await p.route(/(fonts\.g|spotify|youtube|goatcounter|gc\.zgo\.at)/, r => r.abort());
  await p.route(/\/api\/yt-stats/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"channel":"Степной Beat","subscribers":1234,"views":56789,"videos":42}' }));
  const resp = await p.goto(base + url);
  p.status = resp.status();
  await p.waitForTimeout(1500);
  return p;
}

async function axe(p) {
  await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in-v')));
  await p.addScriptTag({ path: path.join(VENDOR, 'axe.min.js') });
  const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  return r.violations.map(v => `${v.id} (${v.nodes.length})`);
}

(async () => {
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  console.log('Файлы');
  for (const r of releases) if (!fs.existsSync(path.join(PUB, 'release', r.slug, 'index.html'))) ok(false, 'нет страницы релиза ' + r.slug);
  ok(true, `страницы релизов: ${releases.length}`);
  const sitemap = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  ok((sitemap.match(/<loc>/g) || []).length === releases.length + 2, 'sitemap.xml: обе главные + все русские релизы');
  ok(!sitemap.includes('/en/release/'), 'английских страниц релизов нет в sitemap (пока они скрыты от поиска)');
  ok(fs.readFileSync(path.join(PUB, 'en', 'release', releases[0].slug, 'index.html'), 'utf8').includes('noindex,follow'), 'английские страницы релизов помечены noindex');
  ok(!fs.readFileSync(path.join(PUB, 'release', releases[0].slug, 'index.html'), 'utf8').includes('noindex'), 'русские страницы релизов открыты для поиска');
  for (const r of releases) if (!fs.existsSync(path.join(PUB, 'en', 'release', r.slug, 'index.html'))) ok(false, 'нет английской страницы ' + r.slug);
  ok(fs.existsSync(path.join(PUB, 'googlea048f3341ff043d2.html')), 'файл подтверждения Google на месте');

  console.log('Главная, компьютер');
  let p = await page(browser, base, '/?lite', { width: 1280, height: 800 });
  ok(p.errors.length === 0, 'нет ошибок JavaScript' + (p.errors.length ? ': ' + p.errors.join('; ') : ''));
  ok(await p.evaluate(() => document.body.classList.contains('gl-on')), '3D-сцена запустилась');
  ok(await p.evaluate(() => document.querySelectorAll('.cat .card').length) === releases.length, 'в каталоге все релизы');
  const hrefs = await p.evaluate(() => [...document.querySelectorAll('.cat .card')].map(a => a.getAttribute('href')));
  ok(hrefs.every(h => /^\/release\/[a-z0-9-]+\/$/.test(h) && fs.existsSync(path.join(PUB, h, 'index.html'))), 'карточки ведут на существующие страницы релизов');
  ok((await p.textContent('#ytStats')).replace(/\s/g, '').includes('1234подписчика'), 'цифры YouTube показываются полностью и с правильным склонением');
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.cat li')].filter(l => l.offsetParent).length);
  await p.click('.chip[data-f="remix"]');
  ok(await vis() === releases.filter(r => r.type === 'remix').length, 'фильтр «Ремиксы»');
  ok(!(await p.evaluate(() => !!document.getElementById('catMore').offsetParent)), 'при фильтре кнопка «Показать все» скрыта');
  await p.click('.chip[data-f="all"]');
  await p.fill('#catQ', 'журав'); ok(await vis() === 1, 'поиск по названию');
  await p.fill('#catQ', 'нетакоготрека'); ok(await p.evaluate(() => !document.getElementById('catEmpty').hidden), 'сообщение «Ничего не найдено»');
  await p.fill('#catQ', '');
  await p.click('.cat li:first-child .card');
  ok(await p.evaluate(() => document.getElementById('relDlg').open), 'окно релиза открывается');
  ok((await p.getAttribute('#relPage', 'href')) === hrefs[0], 'в окне есть ссылка на страницу релиза');
  await p.keyboard.press('Escape');
  ok(!(await p.evaluate(() => document.getElementById('relDlg').open)), 'окно закрывается по Esc');
  await p.click('#anim');
  ok(await p.evaluate(() => document.body.classList.contains('still')), 'кнопка паузы анимации работает');
  await p.click('#anim');
  await p.click('#sound');
  ok(await p.evaluate(() => document.getElementById('sound').classList.contains('on')), 'кнопка музыки включается');
  await p.click('#sound');
  const v1 = await axe(p); ok(v1.length === 0, 'доступность (axe): ' + (v1.join(', ') || 'без ошибок'));
  ok(p.errors.length === 0, 'после всех действий нет ошибок JavaScript' + (p.errors.length ? ': ' + p.errors.join('; ') : ''));

  await Promise.all([p.waitForNavigation(), p.click('.lang button[data-l="en"]')]);
  ok(new URL(p.url()).pathname === '/en/', 'кнопка EN ведёт на /en/');

  console.log('Английская версия');
  p = await page(browser, base, '/en/?lite', { width: 1280, height: 800 });
  ok(p.errors.length === 0 && await p.evaluate(() => document.documentElement.lang) === 'en', '/en/ открывается, язык страницы — английский');
  ok((await p.title()).startsWith('Stepnoy Beat') && (await p.textContent('#listen h2')) === 'Listen', 'заголовки на английском');
  ok((await p.getAttribute('.cat li:first-child .card', 'href')).startsWith('/en/release/'), 'каталог ведёт на английские страницы релизов');
  ok((await p.textContent('#ytStats')).includes('subscribers'), 'цифры YouTube по-английски');
  const ve = await axe(p); ok(ve.length === 0, 'доступность /en/ (axe): ' + (ve.join(', ') || 'без ошибок'));
  await Promise.all([p.waitForNavigation(), p.click('.lang button[data-l="ru"]')]);
  ok(new URL(p.url()).pathname === '/', 'кнопка RU ведёт на русскую версию');
  p = await page(browser, base, `/en/release/${releases[0].slug}/`, { width: 1280, height: 800 });
  ok(p.status === 200 && p.errors.length === 0 && (await p.textContent('.badge')) !== '' && (await p.textContent('.more h2')) === 'More releases', 'английская страница релиза');
  ok((await p.getAttribute('.lang-link', 'href')) === `/release/${releases[0].slug}/`, 'со страницы релиза есть переход на русскую версию');

  console.log('Главная, телефон');
  p = await page(browser, base, '/?lite', { width: 390, height: 844 });
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).display) === 'grid', 'нижняя панель видна');
  await p.click('#navBtn'); await p.keyboard.press('Escape');
  ok((await p.getAttribute('#navBtn', 'aria-expanded')) === 'false', 'меню закрывается по Esc');
  const v2 = await axe(p); ok(v2.length === 0, 'доступность (axe): ' + (v2.join(', ') || 'без ошибок'));

  console.log('Страницы релизов');
  for (const r of [releases[0], releases[Math.floor(releases.length / 2)], releases[releases.length - 1]]) {
    p = await page(browser, base, `/release/${r.slug}/`, { width: 390, height: 844 });
    ok(p.status === 200 && (await p.textContent('h1')).includes(r.title) && p.errors.length === 0, `«${r.title}» открывается без ошибок`);
    const ld = await p.evaluate(() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].length; } catch (e) { return 0; } });
    ok(ld === 2, 'разметка для Google читается');
  }
  const v3 = await axe(p); ok(v3.length === 0, 'доступность страницы релиза (axe): ' + (v3.join(', ') || 'без ошибок'));

  console.log('Статистика');
  p = await page(browser, base, '/stats/', { width: 1280, height: 800 });
  await p.route(/\/api\/stats/, r => r.request().headers()['x-stats-key'] === 'ok'
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ days: 30, daily: [{ date: '2026-10-30', visits: 3, views: 7 }, { date: '2026-10-31', visits: 5, views: 9 }], pages: { '/': 9 }, clicks: { 'hero-ytmusic': 2 }, refs: { 'youtube.com': 4 }, countries: { RU: 8 }, devices: { m: 6, d: 2 } }) })
    : r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await p.fill('#pw', 'wrong'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  ok((await p.textContent('#err')).includes('Неверный пароль'), 'неверный пароль не пускает');
  await p.fill('#pw', 'ok'); await p.click('button[type=submit]'); await p.waitForTimeout(500);
  ok((await p.textContent('#kVisits')) === '8' && await p.evaluate(() => document.querySelectorAll('#chart g.hit').length) === 2, 'с паролем показываются цифры и график');
  ok(p.errors.length === 0, 'страница статистики без ошибок JavaScript');
  const vs = await axe(p); ok(vs.length === 0, 'доступность статистики (axe): ' + (vs.join(', ') || 'без ошибок'));
  ok(fs.readFileSync(path.join(PUB, 'stats', 'index.html'), 'utf8').includes('noindex'), 'статистика скрыта от поисковиков');

  console.log('404');
  p = await page(browser, base, '/net-takoy-stranicy', { width: 1280, height: 800 });
  ok(p.status === 404 && (await p.textContent('h1')).includes('нет'), 'несуществующий адрес показывает страницу 404');

  await browser.close(); srv.close();
  console.log(failed ? `\nОШИБОК: ${failed} — выкладывать нельзя` : '\nВсё в порядке — можно выкладывать');
  process.exit(failed ? 1 : 0);
})();
