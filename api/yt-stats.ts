declare const process: { env: Record<string, string | undefined> }
// Цифры канала «Степной Beat» на YouTube: подписчики, просмотры, количество видео.
// Ключ YouTube Data API хранится в переменной окружения YOUTUBE_API_KEY и на страницу не попадает.
const HANDLE = "@stepnoybeat"

export async function GET() {
  const key = process.env.YOUTUBE_API_KEY
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
    // цифры обновляются раз в несколько часов — бережём квоту YouTube
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" } },
  )
}
