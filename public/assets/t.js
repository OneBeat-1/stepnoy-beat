/* Собственная статистика сайта: визит, просмотр страницы, нажатия на кнопки с data-track.
   Без cookies и личных данных. Не считает автоматические браузеры и локальную разработку. */
(function () {
  if (navigator.webdriver || /^(localhost|127\.)/.test(location.hostname)) return;
  function send(o) {
    o.m = matchMedia('(pointer: coarse)').matches ? 1 : 0;
    var body = JSON.stringify(o);
    if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/track', { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(function () {});
  }
  var ref = '';
  try {
    var h = new URL(document.referrer).hostname.replace(/^www\./, '');
    if (h && h !== location.hostname) ref = h;
  } catch (e) {}
  var first = false;
  try { first = !sessionStorage.getItem('v'); sessionStorage.setItem('v', '1'); } catch (e) {}
  if (first) send({ t: 'visit', n: location.pathname, r: ref });
  send({ t: 'pv', n: location.pathname, r: ref });
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track]');
    if (el) send({ t: 'click', n: el.getAttribute('data-track') });
  }, true);
})();
