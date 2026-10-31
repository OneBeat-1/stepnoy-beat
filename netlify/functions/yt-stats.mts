import type { Config } from "@netlify/functions"

// Основной канал «Степной Beat» на YouTube (по имени канала, а не по ID музыкального канала)
const HANDLE = "@stepnoybeat"

// Отдаёт сайту цифры канала: подписчики, просмотры, количество видео.
// Ключ YouTube Data API хранится в переменной окружения Netlify и на страницу не попадает.
export default async () => {
  const key = Netlify.env.get("YOUTUBE_API_KEY")
  if (!key) return Response.json({ error: "no_key" }, { status: 503 })

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(HANDLE)}&key=${encodeURIComponent(key)}`
  const res = await fetch(url)
  if (!res.ok) return Response.json({ error: "youtube_" + res.status }, { status: 502 })

  const data = await res.json()
  const ch = data.items?.[0]
  const st = ch?.statistics
  if (!st) return Response.json({ error: "channel_not_found" }, { status: 404 })

  return Response.json(
    {
      channel: ch.snippet?.title ?? null,
      subscribers: st.hiddenSubscriberCount ? null : Number(st.subscriberCount),
      views: Number(st.viewCount),
      videos: Number(st.videoCount),
    },
    {
      headers: {
        // цифры обновляются раз в несколько часов — бережём квоту YouTube
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  )
}

export const config: Config = { path: "/api/yt-stats" }
