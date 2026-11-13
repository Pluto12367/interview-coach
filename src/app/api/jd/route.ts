import { createJd, listJds } from "@/db";
import { analyzeJd } from "@/lib/engine/jd";
import { bad, handle, ok, readJson } from "@/lib/http";

export async function GET() {
  return handle(async () => ok(listJds()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ company?: string; position?: string; rawText: string; url?: string }>(req);
    if (!body.rawText?.trim()) return bad("请提供 JD 原文(或链接抓取结果)");
    const jd = createJd({ ...body, rawText: body.rawText.trim() });
    // 异步解析,前端轮询 GET /api/jd/{id}
    void analyzeJd(jd.id, jd.rawText);
    return ok(jd);
  });
}
