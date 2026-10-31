import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

// Принимает события посещаемости: визит, просмотр страницы, нажатие кнопки.
// Каждое событие — отдельная запись (без счётчиков «прочитал-прибавил-записал»),
// данные события закодированы в ключе, поэтому статистика собирается одним списком ключей.
// Личные данные не хранятся: ни IP, ни cookies, только страна, тип устройства и сайт-источник.

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|yandex|pingdom|uptime|monitor/i

export default async (req: Request, context: Context) => {
  if (BOT.test(req.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 })

  let body: { t?: unknown; n?: unknown; r?: unknown; m?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(null, { status: 400 })
  }

  const type = body.t
  const name = typeof body.n === "string" ? body.n.slice(0, 120) : ""
  const valid =
    ((type === "visit" || type === "pv") && /^\/[a-z0-9/-]*$/.test(name)) ||
    (type === "click" && /^[a-z0-9-]{1,80}$/.test(name))
  if (!valid) return new Response(null, { status: 400 })

  const ref = typeof body.r === "string" && /^[a-z0-9.-]{1,80}$/.test(body.r) ? body.r : ""
  const country = /^[A-Z]{2}$/.test(context.geo?.country?.code ?? "") ? context.geo.country!.code : "XX"
  const device = body.m === 1 ? "m" : "d"
  const day = new Date().toISOString().slice(0, 10)
  const key = `e/${day}/${type}|${encodeURIComponent(name)}|${ref}|${country}|${device}|${crypto.randomUUID().slice(0, 8)}`

  await getStore("stats").set(key, "1")
  return new Response(null, { status: 204 })
}

export const config: Config = { path: "/api/track", method: "POST" }
