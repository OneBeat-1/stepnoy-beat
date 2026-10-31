import { pipeline, redisReady } from "./_redis"

// Принимает события посещаемости: визит, просмотр страницы, нажатие кнопки.
// Хранятся только счётчики за день: тип|страница|источник|страна|устройство.
// Личные данные не хранятся: ни IP, ни cookies.
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|yandex|pingdom|uptime|monitor/i

export async function POST(req: Request) {
  if (!redisReady() || BOT.test(req.headers.get("user-agent") ?? "")) return new Response(null, { status: 204 })

  let body: { t?: unknown; n?: unknown; r?: unknown; m?: unknown }
  try {
    body = JSON.parse(await req.text())
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
  const cc = req.headers.get("x-vercel-ip-country") ?? ""
  const country = /^[A-Z]{2}$/.test(cc) ? cc : "XX"
  const device = body.m === 1 ? "m" : "d"
  const day = new Date().toISOString().slice(0, 10)
  const key = `s:${day}`

  await pipeline([
    ["HINCRBY", key, `${type}|${name}|${ref}|${country}|${device}`, 1],
    ["EXPIRE", key, 60 * 60 * 24 * 400],
  ])
  return new Response(null, { status: 204 })
}
