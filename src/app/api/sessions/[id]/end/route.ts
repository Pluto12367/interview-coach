import { generateReport } from "@/lib/engine/report";
import { finishSession } from "@/lib/engine/session-state";
import { bad, handle, ok } from "@/lib/http";

/** 手动结束面试并触发报告生成(前端轮询 GET /api/reports/{sessionId}) */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const sessionId = Number(id);
    try {
      finishSession(sessionId);
    } catch (err) {
      return bad(err instanceof Error ? err.message : "结束会话失败");
    }
    void generateReport(sessionId).catch(() => {});
    return ok({ started: true });
  });
}
