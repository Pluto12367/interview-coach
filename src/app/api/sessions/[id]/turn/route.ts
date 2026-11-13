import { generateReport } from "@/lib/engine/report";
import { processTurn } from "@/lib/engine/session-state";
import { bad, handle, ok, readJson } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { text } = await readJson<{ text: string }>(req);
    if (!text?.trim()) return bad("回答内容不能为空");

    const outcome = await processTurn(Number(id), text.trim());
    // 面试自然结束(反问环节收尾)→ 异步生成报告
    if (outcome.ended) void generateReport(Number(id)).catch(() => {});
    return ok(outcome);
  });
}
