import { listWeakPoints, upsertWeakPoint } from "@/db";
import { bad, handle, ok, readJson } from "@/lib/http";

export async function GET() {
  return handle(async () => ok(listWeakPoints()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ description: string; knowledgePoint?: string }>(req);
    if (!body.description?.trim()) return bad("弱点描述不能为空");
    const wp = upsertWeakPoint({ description: body.description.trim(), knowledgePoint: body.knowledgePoint ?? "", source: "manual" });
    return ok(wp);
  });
}
