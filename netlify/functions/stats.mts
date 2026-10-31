import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"

// Отдаёт сводку посещаемости для закрытой страницы /stats/.
// Доступ — по паролю из переменной окружения STATS_KEY (заголовок x-stats-key).

type Counts = Record<string, number>
const add = (o: Counts, k: string) => { o[k] = (o[k] ?? 0) + 1 }

export default async (req: Request) => {
  const secret = Netlify.env.get("STATS_KEY")
  if (!secret || req.headers.get("x-stats-key") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }

  const daysParam = Number(new URL(req.url).searchParams.get("days"))
  const days = Math.min(Math.max(Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 30, 1), 365)
  const store = getStore({ name: "stats", consistency: "strong" })

  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))

  const daily = dates.map(date => ({ date, visits: 0, views: 0 }))
  const pages: Counts = {}, clicks: Counts = {}, refs: Counts = {}, countries: Counts = {}, devices: Counts = {}
  const lists = await Promise.all(dates.map(d => store.list({ prefix: `e/${d}/` })))

  lists.forEach(({ blobs }, i) => {
    for (const { key } of blobs) {
      const [type, rawName, ref, country, device] = key.slice(13).split("|")
      const name = decodeURIComponent(rawName ?? "")
      if (type === "visit") {
        daily[i].visits++
        add(countries, country)
        add(devices, device)
        if (ref) add(refs, ref)
      } else if (type === "pv") {
        daily[i].views++
        add(pages, name)
      } else if (type === "click") {
        add(clicks, name)
      }
    }
  })

  return Response.json(
    { days, daily, pages, clicks, refs, countries, devices },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export const config: Config = { path: "/api/stats" }
