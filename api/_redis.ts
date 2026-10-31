declare const process: { env: Record<string, string | undefined> }
// Мини-клиент Redis (Upstash) через REST: без зависимостей.
// Переменные окружения появляются автоматически после подключения Redis к проекту Vercel.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""

export const redisReady = () => Boolean(URL_ && TOKEN)

export async function pipeline(cmds: (string | number)[][]): Promise<{ result?: unknown; error?: string }[]> {
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmds),
  })
  if (!r.ok) throw new Error("redis " + r.status)
  return r.json()
}
