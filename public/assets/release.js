/* Страницы релизов: обложки из Spotify (общий кэш с главной) и кнопка «Поделиться» */
(function () {
  var covers = {};
  try { covers = JSON.parse(localStorage.getItem('covers') || '{}'); } catch (e) {}
  function put(el, src) {
    var img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.onload = function () { img.classList.add('ok'); };
    img.src = src;
    (el.classList.contains('cover') ? el : el.querySelector('.cover')).appendChild(img);
  }
  document.querySelectorAll('[data-spotify]').forEach(function (el) {
    var id = el.getAttribute('data-spotify');
    if (covers[id]) { put(el, covers[id]); return; }
    fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/album/' + id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.thumbnail_url) return;
        covers[id] = j.thumbnail_url;
        put(el, j.thumbnail_url);
        try { localStorage.setItem('covers', JSON.stringify(covers)); } catch (e) {}
      })
      .catch(function () {});
  });

  var toastEl = document.getElementById('toast'), toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }
  document.querySelectorAll('.js-share').forEach(function (b) {
    b.addEventListener('click', function () {
      var title = b.getAttribute('data-title'), url = b.getAttribute('data-url');
      if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast(document.documentElement.lang === 'en' ? 'Link copied' : 'Ссылка скопирована'); }, function () { toast(url); });
        return;
      }
      toast(url);
    });
  });
})();
