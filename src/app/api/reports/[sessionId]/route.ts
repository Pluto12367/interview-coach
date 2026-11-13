import { getReport } from "@/db";
import { handle, ok } from "@/lib/http";

/** 前端轮询:报告生成状态与结果(生成中/失败均返回 ok,由前端按 status 分支处理) */
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    const { sessionId } = await params;
    const result = getReport(Number(sessionId));
    return ok(result);
  });
}
