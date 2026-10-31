#!/usr/bin/env python3
"""Собирает сайт из исходников: страницы релизов (RU и EN), английскую главную /en/,
404 и sitemap.xml из data/releases.json; обновляет ссылки каталога на главной.
Запуск: python3 scripts/build.py"""
import datetime
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
SITE = "https://stepnoybeat.vercel.app"
YT_MUSIC = "https://music.youtube.com/channel/UCalKSJoSqgctoS0PxJ67yhQ"
RELEASE_TYPE = {"single": "SingleRelease", "remix": "SingleRelease", "album": "AlbumRelease"}

L = {
    "ru": {
        "prefix": "", "locale": "ru_RU", "other": "en", "other_label": "EN", "other_name": "English version",
        "types": {"single": "Сингл", "remix": "Ремикс", "album": "Альбом"},
        "title": "{t} — Степной Beat: слушать онлайн",
        "desc": "«{t}» — {typ} Степной Beat. Слушайте на Spotify, YouTube Music, Apple Music и других площадках.",
        "skip": "Перейти к содержимому", "home_alt": "Степной Beat — на главную", "back": "← Весь каталог",
        "crumbs": "Навигационная цепочка", "home": "Главная", "catalog": "Каталог",
        "spotify": "Слушать в Spotify ↗", "share": "Поделиться",
        "also": 'Также на Apple Music, Deezer, Tidal и других площадках — <a href="{home}#listen">все ссылки</a>.',
        "player": "Плеер", "player_title": "Плеер Spotify — {t}", "more": "Ещё релизы", "all": "Весь каталог ({n})",
        "explicit": "Ненормативная лексика",
    },
    "en": {
        "prefix": "/en", "locale": "en_US", "other": "ru", "other_label": "RU", "other_name": "Русская версия",
        "types": {"single": "Single", "remix": "Remix", "album": "Album"},
        "title": "{t} — Stepnoy Beat: listen online",
        "desc": "“{t}” — a {typ} by Stepnoy Beat. Listen on Spotify, YouTube Music, Apple Music and other platforms.",
        "skip": "Skip to content", "home_alt": "Stepnoy Beat — home", "back": "← Full catalog",
        "crumbs": "Breadcrumb", "home": "Home", "catalog": "Catalog",
        "spotify": "Listen on Spotify ↗", "share": "Share",
        "also": 'Also on Apple Music, Deezer, Tidal and more — <a href="{home}#listen">all links</a>.',
        "player": "Player", "player_title": "Spotify player — {t}", "more": "More releases", "all": "Full catalog ({n})",
        "explicit": "Explicit",
    },
}

releases = json.loads((ROOT / "data/releases.json").read_text())
# Английские страницы релизов почти повторяют русские и содержат мало текста.
# Пока у релизов нет уникальных описаний, держим их вне индекса: noindex и не в sitemap.
EN_RELEASES_INDEXED = False
esc = html.escape


def spotify(r):
    return "https://open.spotify.com/album/" + r["spotify_id"]


def page_url(r, lang="ru"):
    return f"{L[lang]['prefix']}/release/{r['slug']}/"


def explicit(r, lang):
    return f' <abbr class="ex" title="{L[lang]["explicit"]}">E</abbr>' if r["explicit"] else ""


def alternates(path_ru, path_en):
    return (f'<link rel="alternate" hreflang="ru" href="{SITE}{path_ru}">\n'
            f'<link rel="alternate" hreflang="en" href="{SITE}{path_en}">\n'
            f'<link rel="alternate" hreflang="x-default" href="{SITE}{path_ru}">')


def head(lang, title, desc, canonical, og_title, extra):
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="music.album">
<meta property="og:site_name" content="Степной Beat">
<meta property="og:locale" content="{L[lang]['locale']}">
<meta property="og:url" content="{canonical}">
<meta property="og:title" content="{esc(og_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{SITE}/og-preview.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#140c07">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;800&family=Golos+Text:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/release.css">
{extra}
</head>
"""


def top(lang, other_href):
    t = L[lang]
    home = t["prefix"] + "/"
    return f"""<body>
<a class="skip" href="#main">{t['skip']}</a>
<header class="top">
  <a class="brand" href="{home}"><img src="/logo.webp" alt="{t['home_alt']}" width="1000" height="667"></a>
  <div class="top-r">
    <a class="lang-link" href="{other_href}" hreflang="{t['other']}" lang="{t['other']}" aria-label="{t['other_name']}">{t['other_label']}</a>
    <a class="back" href="{home}#catalog">{t['back']}</a>
  </div>
</header>
"""


FOOT = """<footer><a href="{home}">stepnoybeat.vercel.app</a><span>© 2026 Степной Beat</span></footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/assets/release.js" defer></script>
<script src="/assets/t.js" defer></script>
</body>
</html>
"""


def card(r, lang):
    return (f'<li><a class="card" href="{page_url(r, lang)}" data-spotify="{r["spotify_id"]}">'
            f'<span class="cover" aria-hidden="true"><span class="ph">{esc(r["title"][0].upper())}</span></span>'
            f'<span class="ct">{esc(r["title"])}{explicit(r, lang)}</span></a></li>')


def release_page(i, r, lang):
    t, tx = r["title"], L[lang]
    typ = tx["types"][r["type"]]
    home = tx["prefix"] + "/"
    canonical = SITE + page_url(r, lang)
    desc = tx["desc"].format(t=t, typ=typ.lower())
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "MusicAlbum", "@id": canonical + "#release", "name": t, "url": canonical, "inLanguage": lang,
             "albumReleaseType": RELEASE_TYPE[r["type"]], "sameAs": [spotify(r)],
             "potentialAction": {"@type": "ListenAction", "target": spotify(r)},
             "byArtist": {"@type": "MusicGroup", "@id": SITE + "/#artist", "name": "Степной Beat", "url": SITE + "/"}},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": tx["home"], "item": SITE + home},
                {"@type": "ListItem", "position": 2, "name": tx["catalog"], "item": SITE + home + "#catalog"},
                {"@type": "ListItem", "position": 3, "name": t, "item": canonical}]},
        ],
    }
    more = [releases[(i + k) % len(releases)] for k in range(1, 9)]
    robots = '<meta name="robots" content="noindex,follow">\n' if lang == "en" and not EN_RELEASES_INDEXED else ""
    links = alternates(page_url(r, "ru"), page_url(r, "en")) if EN_RELEASES_INDEXED else ""
    extra = robots + links + '\n<script type="application/ld+json">\n' + json.dumps(ld, ensure_ascii=False, indent=1) + "\n</script>"
    out = head(lang, tx["title"].format(t=t), desc, canonical, f"{t} — Степной Beat", extra)
    out += top(lang, page_url(r, tx["other"]))
    out += f"""<main id="main">
  <nav class="crumbs" aria-label="{tx['crumbs']}"><a href="{home}">{tx['home']}</a> › <a href="{home}#catalog">{tx['catalog']}</a> › <span aria-current="page">{esc(t)}</span></nav>
  <section class="rel">
    <span class="cover big" data-spotify="{r['spotify_id']}" aria-hidden="true"><span class="ph">{esc(t[0].upper())}</span></span>
    <div class="info">
      <span class="badge">{typ}</span>
      <h1>{esc(t)}{explicit(r, lang)}</h1>
      <p class="by">Степной Beat</p>
      <div class="actions">
        <a class="btn-gold" href="{spotify(r)}" target="_blank" rel="noopener" data-track="release-spotify-{r['slug']}">{tx['spotify']}</a>
        <a class="btn" href="{YT_MUSIC}" target="_blank" rel="noopener" data-track="release-ytmusic">YouTube Music ↗</a>
        <button type="button" class="btn js-share" data-title="{esc(t)} — Степной Beat" data-url="{canonical}">{tx['share']}</button>
      </div>
      <p class="also">{tx['also'].format(home=home)}</p>
    </div>
  </section>
  <section class="player" aria-label="{tx['player']}">
    <iframe title="{esc(tx['player_title'].format(t=t))}" src="https://open.spotify.com/embed/album/{r['spotify_id']}?utm_source=generator&amp;theme=0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
  </section>
  <section class="more">
    <h2>{tx['more']}</h2>
    <ul class="cat">{''.join(chr(10) + '      ' + card(m, lang) for m in more)}
    </ul>
    <a class="btn" href="{home}#catalog">{tx['all'].format(n=len(releases))}</a>
  </section>
</main>
"""
    return out + FOOT.format(home=home)


def not_found():
    out = head("ru", "Страница не найдена — Степной Beat", "Такой страницы нет. Перейдите на главную или в каталог релизов.",
               SITE + "/404", "Степной Beat", '<meta name="robots" content="noindex">')
    out += top("ru", "/en/")
    out += """<main id="main" class="nf">
  <h1>Такой страницы нет</h1>
  <p>Возможно, ссылка устарела. Музыка — на главной и в каталоге.</p>
  <p lang="en">Page not found. <a href="/en/">Go to the English version</a>.</p>
  <div class="actions"><a class="btn-gold" href="/">На главную</a><a class="btn" href="/#catalog">Каталог релизов</a></div>
</main>
"""
    return out + FOOT.format(home="/")


# ---------- страницы релизов на двух языках ----------
for lang in ("ru", "en"):
    for i, r in enumerate(releases):
        d = PUB / page_url(r, lang).strip("/")
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(release_page(i, r, lang))
(PUB / "404.html").write_text(not_found())
(PUB / "stats" / "titles.json").write_text(json.dumps({r["slug"]: r["title"] for r in releases}, ensure_ascii=False))

# ---------- главная (RU): карточки каталога, плашка «Новый релиз», разметка ----------
idx = PUB / "index.html"
s = idx.read_text()
by_id = {r["spotify_id"]: r for r in releases}
def home_card(r):
    t = r["title"]
    ex = ' <abbr class="ex" title="Ненормативная лексика">E</abbr>' if r.get("explicit") else ""
    name = t.lower().replace("ё", "е")
    return (f'        <li data-type="{r["type"]}" data-name="{esc(name)}"><a class="card" href="{page_url(r)}" data-id="{r["spotify_id"]}">'
            f'<span class="cover" aria-hidden="true"><span class="ph">{esc(t[0].upper())}</span></span>'
            f'<span class="ct">{esc(t)}{ex}</span></a></li>\n')
s, k = re.subn(r'(<ul class="cat" id="cat">\n).*?(      </ul>)', lambda m: m.group(1) + "".join(home_card(r) for r in releases) + m.group(2), s, count=1, flags=re.S)
assert k == 1, "не найден список каталога на главной"
n = len(releases)
s = re.sub(r'(<span data-i18n="catSub">[^<]*</span> · )\d+', lambda m: m.group(1) + str(n), s, count=1)
s = re.sub(r'(<span data-i18n="catMore">[^<]*</span> \()\d+\)', lambda m: m.group(1) + f"{n})", s, count=1)
word = "релиз" if n % 10 == 1 and n % 100 != 11 else "релиза" if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else "релизов"
s = re.sub(r"\d+ релиз(а|ов)? на всех площадках", f"{n} {word} на всех площадках", s)
s = re.sub(r"\d+ releases on every platform", f"{n} releases on every platform", s)
newest = releases[0]
s = re.sub(r'<a class="new-rel" href="[^"]*"(?: target="_blank" rel="noopener")?>', f'<a class="new-rel" href="{page_url(newest)}">', s, count=1)
s = re.sub(r'(<b data-i18n="newRel">[^<]*</b><span>)«[^»]*»', lambda m: m.group(1) + f"«{esc(newest['title'])}»", s, count=1)
s = re.sub(r'(<span class="nr-cover" data-spotify=")[^"]*', lambda m: m.group(1) + newest['spotify_id'], s, count=1)
a = s.index('<script type="application/ld+json">') + len('<script type="application/ld+json">')
b = s.index("</script>", a)
ld = json.loads(s[a:b])
ld["@graph"][0]["album"] = [{"@type": "MusicAlbum", "name": r["title"], "url": SITE + page_url(r), "sameAs": [spotify(r)],
                             "byArtist": {"@id": SITE + "/#artist"}} for r in releases]
s = s[:a] + "\n" + json.dumps(ld, ensure_ascii=False, indent=1) + "\n" + s[b:]
idx.write_text(s)

# ---------- английская главная /en/: тот же код, статичный английский текст ----------
js_en = re.search(r"\nen:\{(.*?)\}\};", s, re.S).group(1)
EN = {k: v.replace("\\'", "'") for k, v in re.findall(r"(\w+):'((?:[^'\\]|\\.)*)'", js_en)}
e = s.replace('<html lang="ru">', '<html lang="en">', 1)
e = re.sub(r"<title>[^<]*</title>", f"<title>{esc(EN['title'])}</title>", e, count=1)
desc_en = "Stepnoy Beat — melodic rap, atmospheric hip-hop, club music and a 90s vibe. Hold this rhythm."
e = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc_en}">', e, count=1)
e = re.sub(r'<meta property="og:description" content="[^"]*">',
           '<meta property="og:description" content="Melodic rap, atmospheric hip-hop, club music and a 90s vibe. Listen on YouTube, Spotify, Apple Music and more.">', e, count=1)
e = e.replace('<link rel="canonical" href="https://stepnoybeat.vercel.app/">', '<link rel="canonical" href="https://stepnoybeat.vercel.app/en/">', 1)
e = e.replace('<meta property="og:url" content="https://stepnoybeat.vercel.app/">', '<meta property="og:url" content="https://stepnoybeat.vercel.app/en/">', 1)
e = e.replace('<meta property="og:locale" content="ru_RU">', '<meta property="og:locale" content="en_US">', 1)
e = re.sub(r'(<(\w+)\b[^>]*\bdata-i18n="(\w+)"[^>]*>)[^<]*(</\2>)', lambda m: m.group(1) + esc(EN.get(m.group(3), "")) + m.group(4) if m.group(3) in EN else m.group(0), e)
e = re.sub(r'placeholder="[^"]*"( data-i18n-ph="(\w+)")', lambda m: f'placeholder="{esc(EN[m.group(2)])}"' + m.group(1), e)
e = re.sub(r'aria-label="[^"]*"((?:\s+[\w-]+="[^"]*")*?\s+data-i18n-aria="(\w+)")', lambda m: f'aria-label="{esc(EN[m.group(2)])}"' + m.group(1), e)
for ru_s, en_s in [('title="Ненормативная лексика"', 'title="Explicit"'), ('title="Плеер Spotify"', 'title="Spotify player"'),
                   ("Иконки сервисов:", "Service icons:"), ('>Остановить анимацию</button>', '>Pause animation</button>'),
                   ('alt="Логотип Степной Beat на фоне степи"', 'alt="Stepnoy Beat logo over the steppe"')]:
    e = e.replace(ru_s, en_s)
e = re.sub(r'href="/release/', 'href="/en/release/', e)
(PUB / "en").mkdir(exist_ok=True)
(PUB / "en" / "index.html").write_text(e)

# ---------- sitemap.xml ----------
today = datetime.date.today().isoformat()
urls = [SITE + "/", SITE + "/en/"] + [SITE + page_url(r, lang) for lang in (("ru", "en") if EN_RELEASES_INDEXED else ("ru",)) for r in releases]
(PUB / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                 + "".join(f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today}</lastmod>\n  </url>\n" for u in urls)
                                 + "</urlset>\n")
print(f"Готово: {len(releases)} релизов × 2 языка, главная RU + /en/, 404, sitemap ({len(urls)} адресов)")
