declare const process: { env: Record<string, string | undefined> }
import { pipeline, redisReady } from "./_redis"

// Сводка посещаемости для закрытой страницы /stats/.
// Доступ — по паролю из переменной окружения STATS_KEY (заголовок x-stats-key).
type Counts = Record<string, number>
const add = (o: Counts, k: string, n: number) => { o[k] = (o[k] ?? 0) + n }

export async function GET(req: Request) {
  const secret = process.env.STATS_KEY
  if (!secret || req.headers.get("x-stats-key") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }

  const daysParam = Number(new URL(req.url).searchParams.get("days"))
  const days = Math.min(Math.max(Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 30, 1), 365)
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))

  const daily = dates.map(date => ({ date, visits: 0, views: 0 }))
  const pages: Counts = {}, clicks: Counts = {}, refs: Counts = {}, countries: Counts = {}, devices: Counts = {}
  const res = redisReady() ? await pipeline(dates.map(d => ["HGETALL", `s:${d}`])) : []

  res.forEach(({ result }, i) => {
    const arr = Array.isArray(result) ? (result as string[]) : []
    for (let j = 0; j + 1 < arr.length; j += 2) {
      const n = Number(arr[j + 1]) || 0
      const [type, name, ref, country, device] = arr[j].split("|")
      if (type === "visit") {
        daily[i].visits += n
        add(countries, country, n)
        add(devices, device, n)
        if (ref) add(refs, ref, n)
      } else if (type === "pv") {
        daily[i].views += n
        add(pages, name, n)
      } else if (type === "click") {
        add(clicks, name, n)
      }
    }
  })

  return Response.json({ days, daily, pages, clicks, refs, countries, devices }, { headers: { "Cache-Control": "no-store" } })
}
